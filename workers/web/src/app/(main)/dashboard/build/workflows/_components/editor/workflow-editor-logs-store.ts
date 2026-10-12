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
  runStartedAt: 0,
  steps: [],
  selectedNodeId: null,
  selectedStepIndex: -1,
  openGeneration: 0,
  ...PREFS,
};

let state: WorkflowEditorLogsState = INITIAL;
const listeners = new Set<() => void>();

function stepsSignature(steps: ExecutionStepLog[]): string {
  return steps
    .map(
      (step) =>
        `${step.nodeId}:${step.nodeType}:${step.status}:${step.durationMs ?? ""}:${step.input !== undefined ? 1 : 0}:${step.output !== undefined ? 1 : 0}`,
    )
    .join("|");
}

function sameNodeAt(a: ExecutionStepLog | undefined, b: ExecutionStepLog | undefined): boolean {
  return !!a && !!b && a.nodeId === b.nodeId;
}

/** Keep live input/output (clipped on the progress event) when a persisted preview is thinner. */
function overlayStep(local: ExecutionStepLog, persisted: ExecutionStepLog): ExecutionStepLog {
  return {
    ...local,
    ...persisted,
    nodeType: persisted.nodeType || local.nodeType,
    input: local.input !== undefined ? local.input : persisted.input,
    output: local.output !== undefined ? local.output : persisted.output,
  };
}

/**
 * Persisted snapshots land at slice boundaries, so they can lag the nodes
 * already painted from progress events. Upgrade completed rows in place and
 * keep a trailing row that is still running.
 */
function mergeLiveSteps(local: ExecutionStepLog[], persisted: ExecutionStepLog[]): ExecutionStepLog[] {
  if (!persisted.length) return local;
  const running = local.filter((step) => step.status === "running");
  const done = local.filter((step) => step.status !== "running");
  const base: ExecutionStepLog[] = [];
  let cursor = 0;
  for (const step of persisted) {
    if (sameNodeAt(done[cursor], step)) {
      base.push(overlayStep(done[cursor]!, step));
      cursor += 1;
    } else {
      base.push(step);
    }
  }
  while (cursor < done.length) {
    base.push(done[cursor]!);
    cursor += 1;
  }
  const extras = running.filter((step) => {
    const baseCount = base.filter((row) => row.nodeId === step.nodeId).length;
    const doneCount = done.filter((row) => row.nodeId === step.nodeId).length;
    return baseCount <= doneCount;
  });
  return extras.length ? [...base, ...extras] : base;
}

function doneStatus(status: string | undefined): ExecutionStepLog["status"] {
  if (status === "error" || status === "failed") return "error";
  if (status === "skipped" || status === "cancelled") return "skipped";
  if (status === "pending_human") return "pending_human";
  return "success";
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
    state = {
      workflowId,
      running: true,
      executionKey: null,
      runStartedAt: Date.now(),
      steps: [],
      selectedNodeId: nodeId,
      selectedStepIndex: -1,
      openGeneration: state.openGeneration + 1,
      ...prefsOf(state),
    };
    emit();
  },

  /** Remember the execution key so the panel can reconcile persisted steps. Does not reset polling. */
  touchLive: (workflowId: number, executionKey: string) => {
    if (!executionKey) return;
    if (!state.running) return;
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    if (state.executionKey === executionKey) return;
    state = { ...state, workflowId, executionKey };
    emit();
  },

  /**
   * Paint a step as soon as the engine reports it. Persisted snapshots only
   * exist at slice boundaries, so waiting for them hides the log until the run ends.
   */
  applyProgress: (
    workflowId: number,
    event: {
      type: "started" | "node_start" | "node_done" | "finished";
      executionKey: string;
      nodeId?: string;
      nodeType?: string;
      status?: string;
      input?: unknown;
      output?: unknown;
    },
  ) => {
    if (!state.running) return;
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    if (!event.executionKey || event.type === "finished") return;
    if (state.executionKey && state.executionKey !== event.executionKey) return;

    let steps = state.steps;
    if (event.type === "node_start" && event.nodeId) {
      const last = steps[steps.length - 1];
      if (last?.status === "running" && last.nodeId === event.nodeId) {
        if (event.nodeType && last.nodeType !== event.nodeType) {
          steps = steps.map((step, index) =>
            index === steps.length - 1 ? { ...step, nodeType: event.nodeType! } : step,
          );
        }
      } else {
        steps = [
          ...steps,
          { nodeId: event.nodeId, nodeType: event.nodeType ?? "", status: "running" },
        ];
      }
    } else if (event.type === "node_done" && event.nodeId) {
      const status = doneStatus(event.status);
      let index = -1;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i]?.nodeId === event.nodeId && steps[i]?.status === "running") {
          index = i;
          break;
        }
      }
      const patch: ExecutionStepLog = {
        nodeId: event.nodeId,
        nodeType: event.nodeType || steps[index]?.nodeType || "",
        status,
        ...(event.input !== undefined ? { input: event.input } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
      };
      if (index >= 0) {
        steps = steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
      } else {
        steps = [...steps, patch];
      }
    }

    if (state.executionKey === event.executionKey && stepsSignature(state.steps) === stepsSignature(steps)) return;
    const followingTail = state.selectedStepIndex < 0 || state.selectedStepIndex >= state.steps.length - 1;
    const selected =
      steps.length === 0
        ? { nodeId: state.selectedNodeId, index: state.selectedStepIndex }
        : followingTail
          ? { nodeId: steps[steps.length - 1]!.nodeId, index: steps.length - 1 }
          : pickSelected(steps, state.selectedNodeId, state.selectedStepIndex);
    state = {
      ...state,
      workflowId,
      executionKey: event.executionKey,
      steps,
      selectedNodeId: selected.nodeId,
      selectedStepIndex: selected.index,
    };
    emit();
  },

  /** Fold a persisted snapshot into the live timeline without dropping the node that is still running. */
  syncLive: (workflowId: number, steps: ExecutionStepLog[]) => {
    if (!state.running) return;
    if (state.workflowId != null && state.workflowId !== workflowId) return;
    const merged = mergeLiveSteps(state.steps, steps);
    if (!merged.length || stepsSignature(state.steps) === stepsSignature(merged)) return;
    const followingTail = state.selectedStepIndex < 0 || state.selectedStepIndex >= state.steps.length - 1;
    const selected = followingTail
      ? { nodeId: merged[merged.length - 1]!.nodeId, index: merged.length - 1 }
      : pickSelected(merged, state.selectedNodeId, state.selectedStepIndex);
    state = {
      ...state,
      workflowId,
      steps: merged,
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
