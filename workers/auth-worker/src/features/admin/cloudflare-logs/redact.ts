const SENSITIVE_KEY = /password|secret|token|api[_-]?key|authorization|cookie|credential|sessionid|private|set-cookie/i;
const KEEP_HEADERS = new Set(['cf-ray', 'content-type']);
const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const MAX_STRING = 2000;

export function redactValue(key: string, value: unknown, depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) return `${value.slice(0, MAX_STRING)}…`;
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, i) => redactValue(String(i), item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return redactRecord(value as Record<string, unknown>, depth + 1, key.toLowerCase().includes('header'));
  }
  return value;
}

export function redactRecord(
  input: Record<string, unknown>,
  depth = 0,
  dropHeaders = false,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [key, value] of Object.entries(input)) {
    if (n >= MAX_KEYS) {
      out._truncatedKeys = true;
      break;
    }
    const lower = key.toLowerCase();
    if (dropHeaders || lower === 'headers' || lower.endsWith('.headers')) {
      if (lower === 'headers' || key === 'headers') {
        out[key] = pickSafeHeaders(value);
        n += 1;
        continue;
      }
    }
    out[key] = redactValue(key, value, depth);
    n += 1;
  }
  return out;
}

function pickSafeHeaders(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (KEEP_HEADERS.has(key.toLowerCase())) out[key] = typeof v === 'string' ? v : String(v);
  }
  return out;
}
