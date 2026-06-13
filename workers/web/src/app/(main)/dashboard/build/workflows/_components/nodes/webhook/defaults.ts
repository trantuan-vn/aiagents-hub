/** Default node.data fields for webhook trigger/core variants. */
export function webhookNodeDefaults(
  id: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const isWebhook = extra?.coreKind === "webhook" || extra?.triggerKind === "webhook";
  if (!isWebhook) return {};
  const path = id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
  return {
    httpMethod: "POST",
    webhookPath: path || id,
    webhookAuth: "header",
    webhookRespond: "immediately",
    webhookTriggerMode: "workflow_active",
  };
}

export function triggerWebhookDefaults(nodeId: string): Record<string, unknown> {
  return {
    label: "Webhook",
    triggerKind: "webhook",
    ...webhookNodeDefaults(nodeId, { triggerKind: "webhook" }),
  };
}

export function coreWebhookDefaults(nodeId: string): Record<string, unknown> {
  return {
    label: "Webhook",
    coreKind: "webhook",
    ...webhookNodeDefaults(nodeId, { coreKind: "webhook" }),
  };
}
