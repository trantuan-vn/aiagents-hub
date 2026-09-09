import type { ExecutionStepLog } from "../../_lib/api";

export type WorkflowEditorLogsState = {
  workflowId: number | null;
  running: boolean;
  steps: ExecutionStepLog[];
  selectedNodeId: string | null;
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
  steps: [],
  selectedNodeId: null,
  openGeneration: 0,
  ...PREFS,
};

let state: WorkflowEditorLogsState = INITIAL;
const listeners = new Set<() => void>();

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

function pickSelected(steps: ExecutionStepLog[], prev: string | null): string | null {
  const error = steps.find((step) => step.status === "error");
  if (error) return error.nodeId;
  const pending = steps.find((step) => step.status === "pending_human");
  if (pending) return pending.nodeId;
  if (prev && steps.some((step) => step.nodeId === prev)) return prev;
  return steps[steps.length - 1]?.nodeId ?? null;
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
    state = {
      workflowId,
      running: true,
      steps: [],
      selectedNodeId: nodeId,
      openGeneration: state.openGeneration + 1,
      ...prefsOf(state),
    };
    emit();
  },

  finishRun: (workflowId: number, steps?: ExecutionStepLog[]) => {
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    const nextSteps = steps?.length ? steps : state.steps;
    state = {
      workflowId,
      running: false,
      steps: nextSteps,
      selectedNodeId: pickSelected(nextSteps, state.selectedNodeId),
      openGeneration: steps?.length ? state.openGeneration + 1 : state.openGeneration,
      ...prefsOf(state),
    };
    emit();
  },

  selectNode: (nodeId: string) => {
    if (state.selectedNodeId === nodeId) return;
    state = { ...state, selectedNodeId: nodeId };
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
    state = {
      workflowId,
      running: false,
      steps,
      selectedNodeId: pickSelected(steps, state.selectedNodeId),
      openGeneration: state.openGeneration + 1,
      ...prefsOf(state),
    };
    emit();
  },
};
