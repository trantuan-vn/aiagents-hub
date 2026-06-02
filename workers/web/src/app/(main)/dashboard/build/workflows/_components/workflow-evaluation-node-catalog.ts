export type WorkflowEvaluationActionId =
  | "set_inputs"
  | "set_outputs"
  | "set_metrics"
  | "check_if_evaluating";

export type WorkflowEvaluationActionItem = {
  id: WorkflowEvaluationActionId;
  label: string;
};

export const WORKFLOW_EVALUATION_ACTIONS: WorkflowEvaluationActionItem[] = [
  { id: "set_inputs", label: "Set Inputs" },
  { id: "set_outputs", label: "Set Outputs" },
  { id: "set_metrics", label: "Set Metrics" },
  { id: "check_if_evaluating", label: "Check If Evaluating" },
];

export const WORKFLOW_EVALUATION_TRIGGER = {
  id: "new_evaluation",
  label: "On new Evaluation event",
} as const;
