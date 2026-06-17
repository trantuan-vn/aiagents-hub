"use client";

import { useCallback, useMemo, useState } from "react";

import type { Node } from "@xyflow/react";
import {
  buildWebhookItemOutput,
  normalizeWebhookItemOutput,
  type WebhookItemOutput,
} from "@aiagents-hub/workflow-nodes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createWorkflowTrigger,
  getWorkflowExecution,
  listWorkflowTriggers,
  type ExecutionStepLog,
} from "../../_lib/api";
import { isWebhookNode } from "../panels/node-config/webhook-node-config-panel";

import { useWebhookListenWs, type WorkflowWebhookWsEvent } from "./use-webhook-listen-ws";
import { useWorkflowRunFromNode } from "./use-workflow-run-from-node";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

function resolveWebhookPath(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const custom = String(data.webhookPath ?? "").trim().replace(/^\/+/, "");
  if (custom) return custom;
  return node.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || node.id;
}

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

export function useWorkflowExecuteEntry({
  workflowId,
  ownerId,
  nodes,
  patchNodeDataById,
  readOnly,
}: {
  workflowId?: number;
  ownerId?: string;
  nodes: Node[];
  patchNodeDataById?: (nodeId: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const tExecute = useTranslations("WorkflowExecutePage");
  const tRegistry = useTranslations("WorkflowNodeRegistry");
  const tEditor = useTranslations("WorkflowEditorPage");

  const { runFromNode, running } = useWorkflowRunFromNode({
    workflowId,
    ownerId,
    patchNodeDataById,
    readOnly,
  });

  const [listeningNodeId, setListeningNodeId] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState<WebhookItemOutput | null>(null);

  const listeningNode = useMemo(
    () => (listeningNodeId ? nodes.find((node) => node.id === listeningNodeId) : undefined),
    [listeningNodeId, nodes],
  );

  const webhookPath = listeningNode ? resolveWebhookPath(listeningNode) : "";

  const testUrl = useMemo(() => {
    if (!workflowId || !webhookPath) return undefined;
    return `${API_BASE_URL}/hooks/workflows/${workflowId}/${encodeURIComponent(webhookPath)}`;
  }, [workflowId, webhookPath]);

  const ensureWebhookTrigger = useCallback(
    async (node: Node) => {
      if (!workflowId) return;
      const path = resolveWebhookPath(node);
      const { triggers } = await listWorkflowTriggers(workflowId);
      const existing = triggers.find(
        (trigger) =>
          trigger.type === "webhook" &&
          (trigger.nodeId === node.id || trigger.webhookPath === path),
      );
      if (existing) return;
      await createWorkflowTrigger(workflowId, {
        type: "webhook",
        nodeId: node.id,
        webhookPath: path,
      });
    },
    [workflowId],
  );

  const applyWebhookEvent = useCallback(
    async (event: WorkflowWebhookWsEvent) => {
      if (!listeningNodeId || !patchNodeDataById) return;

      const url = testUrl ?? "";
      const item =
        normalizeWebhookItemOutput(event.output, url) ??
        buildWebhookItemOutput({
          webhookUrl: url,
          headers: { "x-http-method": event.method },
          body: (() => {
            try {
              return JSON.parse(event.input);
            } catch {
              return event.input;
            }
          })(),
          executionMode: "test",
        });

      setLiveOutput(item);
      patchNodeDataById(listeningNodeId, { _output: item, _outputPinned: true });

      try {
        const { execution: record } = await getWorkflowExecution(event.executionKey);
        if (record.steps?.length) {
          applyStepOutputs(record.steps, patchNodeDataById);
        }
        if (record.status === "completed") toast.success(tExecute("completed"));
        else if (record.status === "pending_human") toast.message(tExecute("pending_human"));
        else if (record.status === "cancelled") toast.message(tExecute("cancelled"));
        else if (record.status === "failed") toast.error(tExecute("failed"));
        else toast.success(tRegistry("webhook_event_received"));
      } catch {
        if (event.status === "completed") toast.success(tRegistry("webhook_event_received"));
        else if (event.status === "failed") toast.error(tExecute("failed"));
        else toast.success(tRegistry("webhook_event_received"));
      }
    },
    [listeningNodeId, patchNodeDataById, tExecute, tRegistry, testUrl],
  );

  useWebhookListenWs({
    workflowId,
    nodeId: listeningNodeId ?? "",
    webhookPath,
    listening: !!listeningNodeId,
    enabled: !!listeningNodeId && !!workflowId,
    onEvent: (event) => {
      void applyWebhookEvent(event);
    },
  });

  const stopWebhookListen = useCallback(() => {
    setListeningNodeId(null);
    setLiveOutput(null);
  }, []);

  const startWebhookListen = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (!node || !isWebhookNode(node)) return;
      try {
        await ensureWebhookTrigger(node);
        setLiveOutput(null);
        setListeningNodeId(nodeId);
        toast.message(tEditor("webhook_execute_listening"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : tExecute("failed"));
      }
    },
    [ensureWebhookTrigger, nodes, tEditor, tExecute],
  );

  const executeFromEntry = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (node && isWebhookNode(node)) {
        if (listeningNodeId === nodeId) {
          stopWebhookListen();
          return;
        }
        await startWebhookListen(nodeId);
        return;
      }
      await runFromNode(nodeId);
    },
    [listeningNodeId, nodes, runFromNode, startWebhookListen, stopWebhookListen],
  );

  return {
    executeFromEntry,
    running,
    webhookListening: !!listeningNodeId,
    listeningNodeId,
    stopWebhookListen,
    testUrl,
    liveOutput,
  };
}
