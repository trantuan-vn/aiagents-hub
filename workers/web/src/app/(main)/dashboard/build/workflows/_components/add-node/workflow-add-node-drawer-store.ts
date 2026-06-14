import type { WorkflowEvaluationActionId } from "../catalogs/workflow-evaluation-node-catalog";
import type { WorkflowAddNodePick } from "./workflow-add-node-panel";
import type { WorkflowAddNodePanelView } from "./workflow-add-node-panel";

export type WorkflowAddNodeDrawerOpenOptions = {
  variant?: "full" | "connect";
  allowedNodeTypes?: string[];
  initialView?: WorkflowAddNodePanelView;
  highlightEvaluationAction?: WorkflowEvaluationActionId;
  onPick: (pick: WorkflowAddNodePick) => void;
};

export type WorkflowAddNodeDrawerState = {
  isOpen: boolean;
  openGeneration: number;
  config: WorkflowAddNodeDrawerOpenOptions | null;
};

const INITIAL: WorkflowAddNodeDrawerState = {
  isOpen: false,
  openGeneration: 0,
  config: null,
};

let state: WorkflowAddNodeDrawerState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const workflowAddNodeDrawerStore = {
  getState: (): WorkflowAddNodeDrawerState => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  open: (options: WorkflowAddNodeDrawerOpenOptions) => {
    state = {
      isOpen: true,
      openGeneration: state.openGeneration + 1,
      config: options,
    };
    emit();
  },

  close: () => {
    if (!state.isOpen) return;
    state = { ...state, isOpen: false };
    emit();
  },
};

export const workflowAddNodeDrawerActions = {
  open: workflowAddNodeDrawerStore.open,
  close: workflowAddNodeDrawerStore.close,
};
