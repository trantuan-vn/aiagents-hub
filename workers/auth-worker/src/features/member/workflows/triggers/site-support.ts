type SiteSupportEnv = {
  SITE_SUPPORT_WORKFLOW_ID?: string;
  SITE_SUPPORT_OWNER_ID?: string;
  SITE_SUPPORT_CHAT_PATH?: string;
};

const MIN_REASONING_SECONDS = 3;
const MAX_REASONING_SECONDS = 120;

/** Seconds shown on /support. Same 3–120 clamp as the tools_agent runtime. */
export function siteSupportReplySeconds(definition: { nodes?: unknown }): number | null {
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as { type?: unknown; data?: unknown };
    if (record.type !== 'agent') continue;
    const data =
      record.data && typeof record.data === 'object' && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : {};
    if (String(data.agentKind ?? 'tools_agent') !== 'tools_agent') continue;
    const seconds = typeof data.maxReasoningSeconds === 'number' ? data.maxReasoningSeconds : Number(data.maxReasoningSeconds);
    if (!Number.isFinite(seconds) || !(seconds > 0)) continue;
    return Math.min(MAX_REASONING_SECONDS, Math.max(MIN_REASONING_SECONDS, Math.floor(seconds)));
  }
  return null;
}

/** True only for the public marketing support composer, not every hosted chat. */
export function isSiteSupportChat(
  env: SiteSupportEnv,
  workflowId: number,
  ownerId: string,
  chatPath: string,
): boolean {
  const expectedId = String(env.SITE_SUPPORT_WORKFLOW_ID ?? '').trim();
  const expectedOwner = String(env.SITE_SUPPORT_OWNER_ID ?? '').trim();
  const expectedPath = String(env.SITE_SUPPORT_CHAT_PATH ?? '').trim().replace(/^\/+/, '');
  if (!expectedId || !expectedOwner || !expectedPath) return false;
  const path = chatPath.trim().replace(/^\/+/, '');
  return String(workflowId) === expectedId && ownerId === expectedOwner && path === expectedPath;
}
