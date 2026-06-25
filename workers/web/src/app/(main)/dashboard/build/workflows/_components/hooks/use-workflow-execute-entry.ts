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

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import {
  createWorkflowTrigger,
  getWorkflowExecution,
  listWorkflowTriggers,
  type ExecutionStepLog,
} from "../../_lib/api";
import { buildFormPublicUrl, resolveFormPath } from "../panels/node-config/form-url";
import { isFormNode } from "../panels/node-config/form-node-config-panel";
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
  const dashboardUser = useDashboardUser();
  const resolvedOwnerId = ownerId ?? dashboardUser?.id;

  const { runFromNode, running } = useWorkflowRunFromNode({
    workflowId,
    ownerId,
    patchNodeDataById,
    readOnly,
  });

  const [listeningNodeId, setListeningNodeId] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState<unknown>(null);
  const [formOwnerId, setFormOwnerId] = useState<string | undefined>();

  const listeningNode = useMemo(
    () => (listeningNodeId ? nodes.find((node) => node.id === listeningNodeId) : undefined),
    [listeningNodeId, nodes],
  );

  const listenPath = useMemo(() => {
    if (!listeningNode) return "";
    if (isFormNode(listeningNode)) {
      return resolveFormPath((listeningNode.data ?? {}) as Record<string, unknown>, listeningNode.id);
    }
    return resolveWebhookPath(listeningNode);
  }, [listeningNode]);

  const testUrl = useMemo(() => {
    if (!workflowId || !listenPath || !listeningNode) return undefined;
    if (isFormNode(listeningNode)) {
      return buildFormPublicUrl({
        workflowId,
        formPath: listenPath,
        mode: "test",
        ownerId: formOwnerId ?? resolvedOwnerId,
      });
    }
    return `${API_BASE_URL}/hooks/workflows/${workflowId}/${encodeURIComponent(listenPath)}`;
  }, [workflowId, listenPath, listeningNode, resolvedOwnerId, formOwnerId]);

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

  const ensureFormTrigger = useCallback(
    async (node: Node): Promise<string | undefined> => {
      if (!workflowId) return undefined;
      const path = resolveFormPath((node.data ?? {}) as Record<string, unknown>, node.id);
      const { triggers } = await listWorkflowTriggers(workflowId);
      const existing = triggers.find(
        (trigger) =>
          trigger.type === "form" &&
          (trigger.nodeId === node.id || trigger.webhookPath === path),
      );
      if (existing) return existing.ownerId || undefined;
      const { trigger } = await createWorkflowTrigger(workflowId, {
        type: "form",
        nodeId: node.id,
        webhookPath: path,
      });
      return trigger?.ownerId || undefined;
    },
    [workflowId],
  );

  const applyTriggerEvent = useCallback(
    async (event: WorkflowWebhookWsEvent) => {
      if (!listeningNodeId || !patchNodeDataById || !listeningNode) return;

      const isForm = isFormNode(listeningNode);
      const output = isForm
        ? (event.output ?? (() => {
            try {
              return JSON.parse(event.input);
            } catch {
              return { input: event.input };
            }
          })())
        : (normalizeWebhookItemOutput(event.output, testUrl ?? "") ??
          buildWebhookItemOutput({
            webhookUrl: testUrl ?? "",
            headers: { "x-http-method": event.method },
            body: (() => {
              try {
                return JSON.parse(event.input);
              } catch {
                return event.input;
              }
            })(),
            executionMode: "test",
          }));

      setLiveOutput(output);
      patchNodeDataById(listeningNodeId, { _output: output, _outputPinned: true });

      try {
        const { execution: record } = await getWorkflowExecution(event.executionKey);
        if (record.steps?.length) {
          applyStepOutputs(record.steps, patchNodeDataById);
        }
        if (record.status === "completed") toast.success(tExecute("completed"));
        else if (record.status === "pending_human") toast.message(tExecute("pending_human"));
        else if (record.status === "cancelled") toast.message(tExecute("cancelled"));
        else if (record.status === "failed") toast.error(tExecute("failed"));
        else toast.success(isForm ? tRegistry("form_event_received") : tRegistry("webhook_event_received"));
      } catch {
        if (event.status === "completed") {
          toast.success(isForm ? tRegistry("form_event_received") : tRegistry("webhook_event_received"));
        } else if (event.status === "failed") toast.error(tExecute("failed"));
        else toast.success(isForm ? tRegistry("form_event_received") : tRegistry("webhook_event_received"));
      }
    },
    [listeningNode, listeningNodeId, patchNodeDataById, tExecute, tRegistry, testUrl],
  );

  useWebhookListenWs({
    workflowId,
    nodeId: listeningNodeId ?? "",
    webhookPath: listenPath,
    listening: !!listeningNodeId,
    enabled: !!listeningNodeId && !!workflowId,
    onEvent: (event) => {
      void applyTriggerEvent(event);
    },
  });

  const stopListen = useCallback(() => {
    setListeningNodeId(null);
    setLiveOutput(null);
  }, []);

  const startFormTest = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (!node || !isFormNode(node) || !workflowId) return;
      try {
        const triggerOwnerId = await ensureFormTrigger(node);
        const ownerIdForUrl = triggerOwnerId ?? resolvedOwnerId;
        if (!ownerIdForUrl) {
          toast.error(tRegistry("form_owner_required"));
          return;
        }
        if (triggerOwnerId) setFormOwnerId(triggerOwnerId);
        const path = resolveFormPath((node.data ?? {}) as Record<string, unknown>, node.id);
        const url = buildFormPublicUrl({ workflowId, formPath: path, mode: "test", ownerId: ownerIdForUrl });
        setLiveOutput(null);
        setListeningNodeId(nodeId);
        window.open(url, "_blank", "noopener,noreferrer");
        toast.message(tRegistry("form_execute_listening"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : tExecute("failed"));
      }
    },
    [ensureFormTrigger, nodes, resolvedOwnerId, tExecute, tRegistry, workflowId],
  );

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
          stopListen();
          return;
        }
        await startWebhookListen(nodeId);
        return;
      }
      if (node && isFormNode(node)) {
        if (listeningNodeId === nodeId) {
          stopListen();
          return;
        }
        await startFormTest(nodeId);
        return;
      }
      await runFromNode(nodeId);
    },
    [listeningNodeId, nodes, runFromNode, startFormTest, startWebhookListen, stopListen],
  );

  return {
    executeFromEntry,
    running,
    webhookListening: !!listeningNodeId,
    listeningNodeId,
    stopWebhookListen: stopListen,
    testUrl,
    liveOutput: liveOutput as WebhookItemOutput | null,
  };
}
