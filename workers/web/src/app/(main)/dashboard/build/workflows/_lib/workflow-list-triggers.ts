import { buildChatPublicUrl, resolveChatPath } from "../_components/panels/node-config/chat-url";
import { buildFormPublicUrl, resolveFormPath } from "../_components/panels/node-config/form-url";
import { buildWebhookPublicUrl, resolveWebhookPath } from "../_components/panels/node-config/webhook-url";

import type { AgentWorkflow, WorkflowListTriggerSummary } from "./api";

type WorkflowListNode = {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
};

export type { WorkflowListTriggerSummary };

export type WorkflowListChatAction = {
  public: boolean;
  url: string;
};

export type WorkflowListFormAction = {
  nodeId: string;
  label: string;
  url: string;
};

export type WorkflowListWebhookAction = {
  nodeId: string;
  label: string;
  path: string;
  url: string;
};

export type WorkflowListTriggerActions = {
  chat: WorkflowListChatAction | null;
  forms: WorkflowListFormAction[];
  webhooks: WorkflowListWebhookAction[];
};

function parseNodes(definitionJson: string | undefined): WorkflowListNode[] {
  if (!definitionJson) return [];
  try {
    const def = JSON.parse(definitionJson) as { nodes?: WorkflowListNode[] };
    return Array.isArray(def.nodes) ? def.nodes : [];
  } catch {
    return [];
  }
}

function nodeData(node: WorkflowListNode): Record<string, unknown> {
  return node.data ?? {};
}

function nodeLabel(node: WorkflowListNode, fallback: string): string {
  const label = nodeData(node).label;
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

function isChatNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return data.triggerKind === "chat" || node.type === "chat";
}

function isFormTriggerNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return (data.triggerKind === "form" && data.formKind !== "database") || node.type === "form";
}

function isWebhookTriggerNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return data.coreKind === "webhook" || data.triggerKind === "webhook" || node.type === "webhook";
}

function summarizeWorkflowListTriggers(definitionJson: string | undefined): WorkflowListTriggerSummary {
  const nodes = parseNodes(definitionJson).filter((node) => typeof node.id === "string" && node.id);

  const chats = nodes.filter(isChatNode).map((node) => {
    const data = nodeData(node);
    return {
      public: data.chatPublic !== false,
      path: resolveChatPath(data, String(node.id)),
      hosted: String(data.chatMode ?? "hostedChat") !== "webhook",
    };
  });

  return {
    chat: chats.find((entry) => entry.public) ?? chats.at(0) ?? null,
    forms: nodes.filter(isFormTriggerNode).map((node) => {
      const data = nodeData(node);
      const nodeId = String(node.id);
      return {
        nodeId,
        label: nodeLabel(node, "Form"),
        path: resolveFormPath(data, nodeId),
      };
    }),
    webhooks: nodes.filter(isWebhookTriggerNode).map((node) => {
      const data = nodeData(node);
      const nodeId = String(node.id);
      return {
        nodeId,
        label: nodeLabel(node, "Webhook"),
        path: resolveWebhookPath(data, nodeId),
      };
    }),
  };
}

export function hydrateWorkflowListTriggerActions(
  summary: WorkflowListTriggerSummary,
  params: { workflowId: number; ownerId?: string },
): WorkflowListTriggerActions {
  const workflowId = params.workflowId;
  const ownerId = params.ownerId;

  return {
    chat: summary.chat
      ? {
          public: summary.chat.public,
          url: buildChatPublicUrl({
            workflowId,
            chatPath: summary.chat.path,
            mode: "production",
            ownerId,
            hosted: summary.chat.hosted,
          }),
        }
      : null,
    forms: summary.forms.map((form) => ({
      nodeId: form.nodeId,
      label: form.label,
      url: buildFormPublicUrl({
        workflowId,
        formPath: form.path,
        mode: "production",
        ownerId,
      }),
    })),
    webhooks: summary.webhooks.map((webhook) => ({
      nodeId: webhook.nodeId,
      label: webhook.label,
      path: webhook.path,
      url: buildWebhookPublicUrl({ workflowId, webhookPath: webhook.path }),
    })),
  };
}

export function parseWorkflowListTriggerActions(
  definitionJson: string | undefined,
  params: { workflowId: number; ownerId?: string },
): WorkflowListTriggerActions {
  return hydrateWorkflowListTriggerActions(summarizeWorkflowListTriggers(definitionJson), params);
}

export function resolveWorkflowListTriggerActions(
  wf: Pick<AgentWorkflow, "id" | "definition" | "triggers">,
  ownerId?: string,
): WorkflowListTriggerActions {
  const params = { workflowId: wf.id ?? 0, ownerId };
  if (wf.triggers) return hydrateWorkflowListTriggerActions(wf.triggers, params);
  return parseWorkflowListTriggerActions(wf.definition, params);
}
