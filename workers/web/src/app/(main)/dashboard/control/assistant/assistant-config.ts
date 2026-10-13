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
