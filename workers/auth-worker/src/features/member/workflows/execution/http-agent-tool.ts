/** Canvas HTTP tools are `tool_node` + `toolKind: http-request`. Legacy graphs use `http_request` + `asTool`. */
export function isHttpAgentToolNode(node: { type?: string; data?: unknown }): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === 'http_request' && data.asTool === true) return true;
  if (node.type !== 'tool_node') return false;
  return String(data.toolKind ?? '').replace(/-/g, '_') === 'http_request';
}
