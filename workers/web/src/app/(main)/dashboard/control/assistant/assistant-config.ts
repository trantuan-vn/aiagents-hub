/** Production `/chat/...` page for this workflow is not a public hosted chat. */
export function isDashboardAssistantPublicChat(params: {
  workflowId: number;
  chatPath: string;
  ownerId?: string;
}): boolean {
  const expectedId = process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_WORKFLOW_ID?.trim();
  const expectedOwner = process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_OWNER_ID?.trim();
  const expectedPath = (process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_CHAT_PATH?.trim() || "dashboard-assistant").replace(
    /^\/+/,
    "",
  );
  if (!expectedId || !expectedOwner) return false;
  const path = params.chatPath.trim().replace(/^\/+/, "");
  if (String(params.workflowId) !== expectedId || path !== expectedPath) return false;
  if (params.ownerId && params.ownerId !== expectedOwner) return false;
  return true;
}

export function dashboardAssistantChatUrl(): string | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || "https://api.aiagents-hub.vn";
  const workflowId = process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_WORKFLOW_ID?.trim();
  if (!workflowId) return null;
  const chatPath = process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_CHAT_PATH?.trim() || "dashboard-assistant";
  const url = new URL(`${apiBaseUrl}/chat/${encodeURIComponent(workflowId)}/${encodeURIComponent(chatPath)}`);
  const ownerId = process.env.NEXT_PUBLIC_DASHBOARD_ASSISTANT_OWNER_ID?.trim();
  if (ownerId) url.searchParams.set("owner_id", ownerId);
  url.searchParams.set("format", "json");
  return url.toString();
}
