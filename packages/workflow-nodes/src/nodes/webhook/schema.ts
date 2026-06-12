/** Webhook node.data shape (Zod-free for shared package portability). */
export type WebhookNodeData = {
  label?: string;
  httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  webhookPath?: string;
  webhookAuth?: "none" | "basic" | "header" | "jwt";
  webhookRespond?: "immediately" | "when_last_node" | "respond_node" | "streaming";
  webhookTriggerMode?: "workflow_active" | "test";
  triggerKind?: "webhook";
  coreKind?: "webhook";
};

export const WEBHOOK_NODE_DEFAULTS: WebhookNodeData = {
  httpMethod: "GET",
  webhookAuth: "none",
  webhookRespond: "immediately",
  webhookTriggerMode: "workflow_active",
};
