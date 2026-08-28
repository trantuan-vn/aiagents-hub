import type { ExecutionStepLog } from "../../_lib/api";

/**
 * Pin the latest step output onto the canvas node.
 * Human-review sends pause as `pending_human` (mail already went out) — that must
 * replace a previous AUTH / SMTP error, otherwise OUTPUT keeps the stale failure.
 */
export function applyStepOutputs(
  steps: ExecutionStepLog[],
  patchNodeDataById: (nodeId: string, patch: Record<string, unknown>) => void,
) {
  for (const step of steps) {
    if (step.status === "error") {
      patchNodeDataById(step.nodeId, {
        _output: step.output ?? { error: step.error ?? "Execution failed" },
        _outputPinned: true,
      });
      continue;
    }
    if (
      (step.status === "success" || step.status === "pending_human" || step.status === "skipped") &&
      step.output != null
    ) {
      patchNodeDataById(step.nodeId, { _output: step.output, _outputPinned: true });
    }
  }
}
