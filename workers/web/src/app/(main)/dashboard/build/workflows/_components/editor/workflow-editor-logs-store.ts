import type { ExecutionStepLog } from "../../_lib/api";

function lastStepIndexForNode(steps: ExecutionStepLog[], nodeId: string): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.nodeId === nodeId) return i;
  }
  return -1;
}

export type WorkflowEditorLogsState = {
  workflowId: number | null;
  running: boolean;
  /** Execution created for the current editor run. Empty until the first progress event. */
  executionKey: string | null;
  /** Bumped when a live run should refetch checkpointed steps. */
  refreshGeneration: number;
  /** Client time of startRun, used to ignore an older execution still in history. */
  runStartedAt: number;
  steps: ExecutionStepLog[];
  selectedNodeId: string | null;
  selectedStepIndex: number;
  openGeneration: number;
  showInput: boolean;
  showOutput: boolean;
  syncWithCanvas: boolean;
  poppedOut: boolean;
};

const PREFS = {
  showInput: true,
  showOutput: true,
  syncWithCanvas: true,
  poppedOut: false,
};

const INITIAL: WorkflowEditorLogsState = {
  workflowId: null,
  running: false,
  executionKey: null,
  refreshGeneration: 0,
  runStartedAt: 0,
  steps: [],
  selectedNodeId: null,
  selectedStepIndex: -1,
  openGeneration: 0,
  ...PREFS,
};

let state: WorkflowEditorLogsState = INITIAL;
let lastLiveTouch = 0;
const listeners = new Set<() => void>();

function stepsSignature(steps: ExecutionStepLog[]): string {
  return steps
    .map((step) => `${step.nodeId}:${step.status}:${step.durationMs ?? ""}:${step.input !== undefined ? 1 : 0}`)
    .join("|");
}

function emit() {
  listeners.forEach((listener) => listener());
}

function prefsOf(current: WorkflowEditorLogsState) {
  return {
    showInput: current.showInput,
    showOutput: current.showOutput,
    syncWithCanvas: current.syncWithCanvas,
    poppedOut: current.poppedOut,
  };
}

function pickSelected(
  steps: ExecutionStepLog[],
  prevNodeId: string | null,
  prevIndex: number,
): { nodeId: string | null; index: number } {
  const errorIndex = steps.findIndex((step) => step.status === "error");
  if (errorIndex >= 0) return { nodeId: steps[errorIndex]!.nodeId, index: errorIndex };
  const pendingIndex = steps.findIndex((step) => step.status === "pending_human");
  if (pendingIndex >= 0) return { nodeId: steps[pendingIndex]!.nodeId, index: pendingIndex };
  if (prevIndex >= 0 && steps[prevIndex] && (!prevNodeId || steps[prevIndex]!.nodeId === prevNodeId)) {
    return { nodeId: steps[prevIndex]!.nodeId, index: prevIndex };
  }
  if (prevNodeId) {
    const index = lastStepIndexForNode(steps, prevNodeId);
    if (index >= 0) return { nodeId: prevNodeId, index };
  }
  const last = steps.length - 1;
  return { nodeId: steps[last]?.nodeId ?? null, index: last };
}

export const workflowEditorLogsStore = {
  getState: (): WorkflowEditorLogsState => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  bindWorkflow: (workflowId: number) => {
    if (state.workflowId === workflowId) return;
    state = { ...INITIAL, workflowId, ...prefsOf(state) };
    emit();
  },

  startRun: (workflowId: number, nodeId: string) => {
    lastLiveTouch = 0;
    state = {
      workflowId,
      running: true,
      executionKey: null,
      refreshGeneration: state.refreshGeneration,
      runStartedAt: Date.now(),
      steps: [],
      selectedNodeId: nodeId,
      selectedStepIndex: -1,
      openGeneration: state.openGeneration + 1,
      ...prefsOf(state),
    };
    emit();
  },

  /** Ask the logs panel to refetch steps for the execution that is still running. */
  touchLive: (workflowId: number, executionKey: string) => {
    if (!executionKey) return;
    if (!state.running) return;
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    const now = Date.now();
    const sameKey = state.executionKey === executionKey;
    if (sameKey && now - lastLiveTouch < 400) return;
    lastLiveTouch = now;
    state = {
      ...state,
      workflowId,
      executionKey,
      refreshGeneration: state.refreshGeneration + 1,
    };
    emit();
  },

  /** Replace steps while the run is still in progress. Ignores a stale snapshot that dropped steps. */
  syncLive: (workflowId: number, steps: ExecutionStepLog[]) => {
    if (!state.running) return;
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    if (!steps.length || steps.length < state.steps.length) return;
    if (stepsSignature(state.steps) === stepsSignature(steps)) return;
    const followingTail = state.selectedStepIndex < 0 || state.selectedStepIndex >= state.steps.length - 1;
    const selected = followingTail
      ? { nodeId: steps[steps.length - 1]!.nodeId, index: steps.length - 1 }
      : pickSelected(steps, state.selectedNodeId, state.selectedStepIndex);
    state = {
      ...state,
      workflowId,
      steps,
      selectedNodeId: selected.nodeId,
      selectedStepIndex: selected.index,
    };
    emit();
  },

  finishRun: (workflowId: number, steps?: ExecutionStepLog[]) => {
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    const nextSteps = steps?.length ? steps : state.steps;
    const selected = pickSelected(nextSteps, state.selectedNodeId, state.selectedStepIndex);
    state = {
      workflowId,
      running: false,
      executionKey: state.executionKey,
      refreshGeneration: state.refreshGeneration,
      runStartedAt: state.runStartedAt,
      steps: nextSteps,
      selectedNodeId: selected.nodeId,
      selectedStepIndex: selected.index,
      openGeneration: steps?.length ? state.openGeneration + 1 : state.openGeneration,
      ...prefsOf(state),
    };
    emit();
  },

  selectNode: (nodeId: string) => {
    const index = lastStepIndexForNode(state.steps, nodeId);
    if (state.selectedNodeId === nodeId && state.selectedStepIndex === index) return;
    state = { ...state, selectedNodeId: nodeId, selectedStepIndex: index };
    emit();
  },

  selectStep: (index: number) => {
    const step = state.steps[index];
    if (!step) return;
    if (state.selectedStepIndex === index && state.selectedNodeId === step.nodeId) return;
    state = { ...state, selectedNodeId: step.nodeId, selectedStepIndex: index };
    emit();
  },

  setShowInput: (showInput: boolean) => {
    if (state.showInput === showInput) return;
    state = { ...state, showInput };
    emit();
  },

  setShowOutput: (showOutput: boolean) => {
    if (state.showOutput === showOutput) return;
    state = { ...state, showOutput };
    emit();
  },

  setSyncWithCanvas: (syncWithCanvas: boolean) => {
    if (state.syncWithCanvas === syncWithCanvas) return;
    state = { ...state, syncWithCanvas };
    emit();
  },

  setPoppedOut: (poppedOut: boolean) => {
    if (state.poppedOut === poppedOut) return;
    state = { ...state, poppedOut };
    emit();
  },

  hydrate: (workflowId: number, steps: ExecutionStepLog[]) => {
    if (!steps.length) return;
    if (state.running) return;
    if (state.workflowId === workflowId && state.steps.length) return;
    const selected = pickSelected(steps, state.selectedNodeId, state.selectedStepIndex);
    state = {
      workflowId,
      running: false,
      executionKey: state.workflowId === workflowId ? state.executionKey : null,
      refreshGeneration: state.refreshGeneration,
      runStartedAt: state.runStartedAt,
      steps,
      selectedNodeId: selected.nodeId,
      selectedStepIndex: selected.index,
      openGeneration: state.openGeneration + 1,
      ...prefsOf(state),
    };
    emit();
  },
};
