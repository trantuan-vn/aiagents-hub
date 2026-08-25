import type { ResolvedCredential } from '../storage/credentials.js';

/**
 * Runtime helpers for the HTTP Request and Code nodes.
 *
 * NOTE: Cloudflare Workers forbid `eval`/`new Function`, so the Code node does
 * NOT run arbitrary JavaScript. It performs safe template interpolation and
 * JSON shaping instead. A full JS sandbox (via a container/isolate) is a later
 * enhancement.
 */

export type NodeScope = Record<string, unknown>;
type Json = unknown;

// ---------------------------------------------------------------------------
// Template interpolation: resolves {{ path.to.value }} against a scope object.
// ---------------------------------------------------------------------------

function normalizeTemplatePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '$json') return '';
  if (trimmed.startsWith('$json.')) return trimmed.slice('$json.'.length);
  return trimmed;
}

function resolvePath(scope: NodeScope, path: string): unknown {
  const normalized = normalizeTemplatePath(path);
  if (!normalized) return scope;
  const parts = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let cur: unknown = scope;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Interpolate a template string. If the whole string is a single expression
 * (e.g. "{{ data }}"), the raw resolved value is returned (may be non-string).
 */
export function interpolate(template: string, scope: NodeScope): unknown {
  const single = template.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
  if (single) return resolvePath(scope, single[1]);

  return template.replace(TEMPLATE_RE, (_m, expr) => {
    const value = resolvePath(scope, String(expr));
    if (value == null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/** Deep-interpolate every string leaf of a JSON value. */
export function interpolateDeep(value: Json, scope: NodeScope): Json {
  if (typeof value === 'string') return interpolate(value, scope);
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, scope));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateDeep(v, scope);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fd[0-9a-f]{2}:/i,
];

function assertUrlAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  const host = url.hostname;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error(`Blocked host (SSRF protection): ${host}`);
  }
  return url;
}

// ---------------------------------------------------------------------------
// HTTP Request node
// ---------------------------------------------------------------------------

const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Hosts we serve — DO→custom-domain fetch often 522s; short-circuit local sinks. */
const LOCAL_API_HOSTS = new Set(['api.aiagents-hub.vn']);

function normalizeHeaderSpec(raw: unknown, scope: NodeScope): Record<string, string> {
  let spec: unknown = raw ?? {};
  if (typeof spec === 'string') {
    const interpolated = String(interpolate(spec, scope)).trim();
    if (!interpolated) return {};
    try {
      spec = JSON.parse(interpolated);
    } catch {
      return {};
    }
  }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return {};

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec as Record<string, unknown>)) {
    if (!k || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    headers[k] = String(interpolate(String(v ?? ''), scope));
  }
  return headers;
}

function parseRequestBody(body: BodyInit | undefined): unknown {
  if (body == null) return null;
  const text = typeof body === 'string' ? body : undefined;
  if (text == null) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/** In-process /hooks/echo — avoids Cloudflare 522 when a Durable Object fetches its own API host. */
function tryLocalEcho(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | undefined,
): HttpRequestResult | null {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/hooks/echo') return null;
  if (!LOCAL_API_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parsedBody = parseRequestBody(body);
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    safeHeaders[k] = k.toLowerCase() === 'authorization' ? 'Bearer ***' : v;
  }
  const payload = {
    ok: true,
    echo: true,
    local: true,
    method,
    receivedAt: Date.now(),
    headers: safeHeaders,
    body: parsedBody,
    sql:
      parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
        ? String((parsedBody as Record<string, unknown>).sql ?? '')
        : undefined,
  };
  return {
    status: 200,
    ok: true,
    headers: { 'content-type': 'application/json' },
    body: payload,
    data: payload,
  };
}

function applyCredential(
  cred: ResolvedCredential | null,
  url: URL,
  headers: Record<string, string>,
): void {
  if (!cred || cred.type === 'none' || !cred.secret) return;
  switch (cred.type) {
    case 'bearer': {
      let token = cred.secret;
      if (cred.meta.provider === 'gmail') {
        const trimmed = cred.secret.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed) as { access_token?: string };
            if (typeof parsed.access_token === 'string' && parsed.access_token) {
              token = parsed.access_token;
            }
          } catch {
            /* keep secret */
          }
        }
      }
      headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'header':
      if (cred.meta.headerName) headers[cred.meta.headerName] = cred.secret;
      break;
    case 'basic': {
      const user = cred.meta.username ?? '';
      headers['Authorization'] = `Basic ${btoa(`${user}:${cred.secret}`)}`;
      break;
    }
    case 'query':
      if (cred.meta.paramName) url.searchParams.set(cred.meta.paramName, cred.secret);
      break;
  }
}

export interface HttpRequestResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  data: unknown;
  text?: string;
}

export async function runHttpRequest(
  data: Record<string, unknown>,
  scope: NodeScope,
  credential: ResolvedCredential | null,
): Promise<HttpRequestResult> {
  const method = String(data.method ?? 'GET').toUpperCase();
  const rawUrl = String(interpolate(String(data.url ?? ''), scope));
  if (!rawUrl) throw new Error('HTTP node missing url');
  const url = assertUrlAllowed(rawUrl);

  const headers = normalizeHeaderSpec(data.headers, scope);
  applyCredential(credential, url, headers);

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD' && data.body != null) {
    if (typeof data.body === 'string') {
      body = String(interpolate(data.body, scope));
    } else {
      body = JSON.stringify(interpolateDeep(data.body as Json, scope));
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const localEcho = tryLocalEcho(url, method, headers, body);
  if (localEcho) return localEcho;

  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Number(data.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), { method, headers, body, signal: controller.signal });
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    const contentType = res.headers.get('content-type') ?? '';
    const wantsJson = data.jsonResponse === true || contentType.includes('application/json');
    const text = await res.text();
    let parsed: unknown = text;
    if (wantsJson) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: resHeaders,
      body: parsed,
      data: parsed,
      text: typeof parsed === 'string' ? parsed : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Code node (safe transform — not arbitrary JS)
// ---------------------------------------------------------------------------

export interface CodeNodeResult {
  text?: string;
  data?: unknown;
}

export function runCodeNode(data: Record<string, unknown>, scope: NodeScope): CodeNodeResult {
  const mode = String(data.mode ?? 'template');
  const template = data.template ?? data.expression ?? '';

  if (mode === 'json') {
    let parsed: Json;
    if (typeof template === 'string') {
      try {
        parsed = JSON.parse(template);
      } catch (e) {
        throw new Error(`Code node: invalid JSON template — ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      parsed = template as Json;
    }
    const result = interpolateDeep(parsed, scope);
    return { data: result, text: typeof result === 'string' ? result : JSON.stringify(result) };
  }

  // default: template string interpolation
  const result = interpolate(String(template), scope);
  return typeof result === 'string'
    ? { text: result }
    : { data: result, text: JSON.stringify(result) };
}
