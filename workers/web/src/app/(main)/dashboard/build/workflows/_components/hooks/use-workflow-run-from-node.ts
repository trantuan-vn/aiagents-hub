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
    }
  }
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
    async (nodeId: string) => {
      if (!workflowId) return;
      setRunning(true);
      try {
        const result = await executeWorkflow(workflowId, {
          entryNodeId: nodeId,
          ownerId,
        });

        if (!readOnly && patchNodeDataById) {
          applyStepOutputs(result.steps, patchNodeDataById);
        }

        if (result.status === "completed") toast.success(t("completed"));
        else if (result.status === "pending_human") toast.message(t("pending_human"));
        else if (result.status === "cancelled") toast.message(t("cancelled"));
        else toast.error(t("failed"));
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
