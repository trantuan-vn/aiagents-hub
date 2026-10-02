const REDACT_KEYS = new Set([
  'authorization',
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'cookie',
  'connectionstring',
  'connection_string',
  'private_key',
  'privatekey',
]);

const MAX_DEPTH = 24;

function isRedactedKey(key: string): boolean {
  return REDACT_KEYS.has(key.toLowerCase());
}

/** Redact secret keys anywhere in a gateway payload. Prompt and vector fields stay. */
export function redactGatewayPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[REDACTED]';
  if (Array.isArray(value)) {
    return value.map((item) => redactGatewayPayload(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isRedactedKey(key) ? '[REDACTED]' : redactGatewayPayload(child, depth + 1);
    }
    return out;
  }
  return value;
}
