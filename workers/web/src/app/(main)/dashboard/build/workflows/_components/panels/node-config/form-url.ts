const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function resolveFormPath(nodeData: Record<string, unknown>, nodeId: string): string {
  const custom = String(nodeData.formPath ?? "").trim().replace(/^\/+/, "");
  if (custom) return custom;
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || nodeId;
}

export function buildFormPublicUrl(params: {
  workflowId: number;
  formPath: string;
  mode?: "test" | "production";
  ownerId?: string;
}): string {
  const segment = params.mode === "production" ? "form" : "form-test";
  const base = `${API_BASE_URL}/${segment}/${params.workflowId}/${encodeURIComponent(params.formPath)}`;
  if (!params.ownerId) return base;
  const url = new URL(base);
  url.searchParams.set("owner_id", params.ownerId);
  return url.toString();
}
