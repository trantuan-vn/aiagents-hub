"use client";

import { useMemo, useRef } from "react";

import { useWs } from "@/core/use-ws";
import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

export type WorkflowWebhookWsEvent = {
  workflowId: number;
  nodeId: string | null;
  webhookPath: string | null;
  executionKey: string;
  status: string;
  input: string;
  output?: unknown;
  receivedAt: number;
  method: string;
};

type UseWebhookListenWsOptions = {
  workflowId?: number;
  nodeId: string;
  webhookPath: string;
  listening: boolean;
  enabled?: boolean;
  onEvent: (event: WorkflowWebhookWsEvent) => void;
};

function matchesWebhookEvent(
  event: WorkflowWebhookWsEvent,
  workflowId: number,
  nodeId: string,
  webhookPath: string,
): boolean {
  if (event.workflowId !== workflowId) return false;
  if (event.nodeId === nodeId) return true;
  if (event.webhookPath === webhookPath) return true;
  return false;
}

/** Subscribe to `workflow_webhook` WS events (active while panel is open + listening). */
export function useWebhookListenWs({
  workflowId,
  nodeId,
  webhookPath,
  listening,
  enabled = true,
  onEvent,
}: UseWebhookListenWsOptions) {
  const user = useDashboardUser();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  const handlers = useMemo(
    () => ({
      workflow_webhook: (data: unknown) => {
        if (!workflowId || !enabled || !listeningRef.current) return;
        const event = data as WorkflowWebhookWsEvent;
        if (!matchesWebhookEvent(event, workflowId, nodeId, webhookPath)) return;
        onEventRef.current(event);
      },
    }),
    [workflowId, nodeId, webhookPath, enabled],
  );

  useWs(enabled && workflowId && user?.identifier ? user : null, handlers);
}
