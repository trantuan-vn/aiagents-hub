import { buildChatPublicUrl, resolveChatPath } from "../_components/panels/node-config/chat-url";
import { buildFormPublicUrl, resolveFormPath } from "../_components/panels/node-config/form-url";
import { buildWebhookPublicUrl, resolveWebhookPath } from "../_components/panels/node-config/webhook-url";

type WorkflowListNode = {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
};

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

export function parseWorkflowListTriggerActions(
  definitionJson: string | undefined,
  params: { workflowId: number; ownerId?: string },
): WorkflowListTriggerActions {
  const nodes = parseNodes(definitionJson).filter((node) => typeof node.id === "string" && node.id);
  const workflowId = params.workflowId;
  const ownerId = params.ownerId;

  const chats = nodes.filter(isChatNode).map((node) => {
    const data = nodeData(node);
    const chatPath = resolveChatPath(data, String(node.id));
    const chatPublic = data.chatPublic !== false;
    const hosted = String(data.chatMode ?? "hostedChat") !== "webhook";
    return {
      public: chatPublic,
      url: buildChatPublicUrl({
        workflowId,
        chatPath,
        mode: "production",
        ownerId,
        hosted,
      }),
    };
  });
  const chat = chats.find((entry) => entry.public) ?? chats.at(0) ?? null;

  const forms = nodes.filter(isFormTriggerNode).map((node) => {
    const data = nodeData(node);
    const nodeId = String(node.id);
    return {
      nodeId,
      label: nodeLabel(node, "Form"),
      url: buildFormPublicUrl({
        workflowId,
        formPath: resolveFormPath(data, nodeId),
        mode: "production",
        ownerId,
      }),
    };
  });

  const webhooks = nodes.filter(isWebhookTriggerNode).map((node) => {
    const data = nodeData(node);
    const nodeId = String(node.id);
    const path = resolveWebhookPath(data, nodeId);
    return {
      nodeId,
      label: nodeLabel(node, "Webhook"),
      path,
      url: buildWebhookPublicUrl({ workflowId, webhookPath: path }),
    };
  });

  return { chat, forms, webhooks };
}
