const FIRST_PARTY_CHAT_ORIGINS = [
  'https://aiagents-hub.vn',
  'https://www.aiagents-hub.vn',
  'https://beta.aiagents-hub.vn',
  'https://www.beta.aiagents-hub.vn',
] as const;

/**
 * `*` used to echo the request Origin and allow credentials. Anonymous chat
 * now stays on first-party hosts. An explicit comma list still opts a
 * customer domain in, and only that exact origin is echoed.
 */
export function buildChatCorsHeaders(
  originHeader: string | undefined,
  allowedOrigins: string | undefined,
): Record<string, string> {
  const configured = (allowedOrigins ?? '').trim();
  const wildcard = !configured || configured === '*';
  const allowList = wildcard
    ? [...FIRST_PARTY_CHAT_ORIGINS]
    : configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = originHeader?.trim() ?? '';
  const matched = Boolean(origin) && allowList.includes(origin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Credentials': matched ? 'true' : 'false',
    Vary: 'Origin',
  };
  if (matched) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
