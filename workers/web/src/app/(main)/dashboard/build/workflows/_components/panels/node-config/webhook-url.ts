const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function resolveWebhookPath(nodeData: Record<string, unknown>, nodeId: string): string {
  const custom = String(nodeData.webhookPath ?? "")
    .trim()
    .replace(/^\/+/, "");
  if (custom) return custom;
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || nodeId;
}

export function buildWebhookPublicUrl(params: { workflowId: number; webhookPath: string }): string {
  return `${API_BASE_URL}/hooks/workflows/${params.workflowId}/${encodeURIComponent(params.webhookPath)}`;
}
