const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://aiagents-hub.vn";

export function resolveChatPath(nodeData: Record<string, unknown>, nodeId: string): string {
  const custom = String(nodeData.chatPath ?? "").trim().replace(/^\/+/, "");
  if (custom) return custom;
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || nodeId;
}

function originForPage(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return APP_BASE_URL;
}

function withOwner(base: string, ownerId?: string): string {
  if (!ownerId) return base;
  const url = new URL(base);
  url.searchParams.set("owner_id", ownerId);
  return url.toString();
}

function chatSegment(mode: "test" | "production" | undefined): "chat" | "chat-test" {
  return mode === "production" ? "chat" : "chat-test";
}

function workflowSegment(workflowId: number): string {
  return workflowId && !Number.isNaN(workflowId) ? String(workflowId) : "{workflowId}";
}

/** API endpoint used to POST chat messages and fetch JSON metadata. */
export function buildChatApiUrl(params: {
  workflowId: number;
  chatPath: string;
  mode?: "test" | "production";
  ownerId?: string;
}): string {
  const segment = chatSegment(params.mode);
  const workflowSeg = workflowSegment(params.workflowId);
  const base = `${API_BASE_URL}/${segment}/${workflowSeg}/${encodeURIComponent(params.chatPath)}`;
  return withOwner(base, params.ownerId);
}

/** Hosted chat page on the web app (editor + public share). */
export function buildChatPageUrl(params: {
  workflowId: number;
  chatPath: string;
  mode?: "test" | "production";
  ownerId?: string;
}): string {
  const segment = chatSegment(params.mode);
  const workflowSeg = workflowSegment(params.workflowId);
  const base = `${originForPage()}/${segment}/${workflowSeg}/${encodeURIComponent(params.chatPath)}`;
  return withOwner(base, params.ownerId);
}

/** Shareable chat URL: hosted page, or the API webhook for embedded mode. */
export function buildChatPublicUrl(params: {
  workflowId: number;
  chatPath: string;
  mode?: "test" | "production";
  ownerId?: string;
  hosted?: boolean;
}): string {
  if (params.hosted === false) return buildChatApiUrl(params);
  return buildChatPageUrl(params);
}
