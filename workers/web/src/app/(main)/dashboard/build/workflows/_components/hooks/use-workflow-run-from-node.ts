"use client";

import { useCallback, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { executeWorkflow, type ExecutionStepLog } from "../../_lib/api";

function applyStepOutputs(
  steps: ExecutionStepLog[],
  patchNodeDataById: (nodeId: string, patch: Record<string, unknown>) => void,
) {
  for (const step of steps) {
    if (step.status === "success" && step.output != null) {
      patchNodeDataById(step.nodeId, { _output: step.output, _outputPinned: true });
    } else if (step.status === "error") {
      patchNodeDataById(step.nodeId, {
        _output: step.output ?? { error: step.error ?? "Execution failed" },
        _outputPinned: true,
      });
    }
  }
}

function executionErrorMessage(result: { output?: unknown; status: string }, fallback: string): string {
  const output = result.output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const error = (output as { error?: unknown }).error;
    if (error != null && String(error).trim()) return String(error);
  }
  return fallback;
}

export function useWorkflowRunFromNode({
  workflowId,
  ownerId,
  patchNodeDataById,
  readOnly,
}: {
  workflowId?: number;
  ownerId?: string;
  patchNodeDataById?: (nodeId: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("WorkflowExecutePage");
  const [running, setRunning] = useState(false);

  const runFromNode = useCallback(
    async (nodeId: string, input?: string) => {
      if (!workflowId) return;
      setRunning(true);
      try {
        const result = await executeWorkflow(workflowId, {
          entryNodeId: nodeId,
          ownerId,
          input,
        });

        if (!readOnly && patchNodeDataById) {
          applyStepOutputs(result.steps, patchNodeDataById);
        }

        if (result.status === "completed") toast.success(t("completed"));
        else if (result.status === "pending_human") toast.message(t("pending_human"));
        else if (result.status === "cancelled") toast.message(t("cancelled"));
        else toast.error(executionErrorMessage(result, t("failed")));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("failed"));
      } finally {
        setRunning(false);
      }
    },
    [workflowId, ownerId, patchNodeDataById, readOnly, t],
  );

  return { runFromNode, running };
}
