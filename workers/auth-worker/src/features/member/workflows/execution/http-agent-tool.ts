/**
 * Agent tools may template a path on a fixed host (`/items/{{ args.id }}`).
 * A template in the host, or any `{{ $json.` placeholder, lets the model pick
 * the server the worker calls.
 */
export function agentHttpToolUrlIsSafe(rawUrl: string): boolean {
  const url = rawUrl.trim();
  if (!url) return false;
  if (/\{\{\s*\$json\b/.test(url)) return false;
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1] ?? '';
  if (!host) return !url.includes('{{');
  return !host.includes('{{');
}

/** Canvas HTTP tools are `tool_node` + `toolKind: http-request`. Legacy graphs use `http_request` + `asTool`. */
export function isHttpAgentToolNode(node: { type?: string; data?: unknown }): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === 'http_request' && data.asTool === true) return true;
  if (node.type !== 'tool_node') return false;
  return String(data.toolKind ?? '').replace(/-/g, '_') === 'http_request';
}
