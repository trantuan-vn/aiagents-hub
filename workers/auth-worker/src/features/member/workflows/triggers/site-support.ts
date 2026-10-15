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

/** Layout for /support. The CTA marker stays after the fragment so the page can lift it into a button. */
export const SITE_SUPPORT_HTML_NOTE = [
  'The user-visible answer must be an HTML fragment. The first character is "<".',
  'This overrides any instruction to answer in plain text.',
  'Do not wrap the answer in markdown fences, and do not include html, head, body, script, or style tags.',
  'Use p, h2, h3, ul, ol, li, strong, em, and a. A one-line fact is still <p>. Keep the words short.',
  'Link a first-party page with a root path, for example <a href="/packages">packages</a> or <a href="/docs/quickstart">quickstart</a>.',
  'Put the CTA marker on its own line after the HTML, not inside a tag. Example: __support_cta__ signup. No other text after that line.',
].join('\n');

function chatTriggerPaths(definition: { nodes?: unknown }): string[] {
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const paths: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as { type?: unknown; data?: unknown };
    if (record.type !== 'trigger') continue;
    const data =
      record.data && typeof record.data === 'object' && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : {};
    if (String(data.triggerKind ?? '') !== 'chat') continue;
    paths.push(String(data.chatPath ?? ''));
  }
  return paths;
}

/** Extra layout rule for the public support agent. Empty for every other chat. */
export function siteSupportAnswerNote(
  env: SiteSupportEnv,
  workflowId: number,
  ownerId: string,
  definition: { nodes?: unknown },
): string {
  const matched = chatTriggerPaths(definition).some((path) => isSiteSupportChat(env, workflowId, ownerId, path));
  return matched ? SITE_SUPPORT_HTML_NOTE : '';
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
