import { interpolate, interpolateDeep } from '@aiagents-hub/workflow-nodes';

import { publicPlansCatalog } from '../billing/catalog.js';
import type { ResolvedCredential } from '../storage/credentials.js';

/**
 * Runtime helpers for the HTTP Request and Code nodes.
 *
 * NOTE: Cloudflare Workers forbid `eval`/`new Function`. Templates use a
 * sandboxed expression language (no arbitrary JS) shared with workflow-nodes.
 */

export type NodeScope = Record<string, unknown>;
type Json = unknown;

export { interpolate, interpolateDeep };

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

const MAX_HTTP_REDIRECTS = 3;

/** Follow a redirect only when the next hop passes the same host blocklist. */
export function resolveHttpRedirect(currentUrl: string, location: string): URL {
  let next: URL;
  try {
    next = new URL(location, currentUrl);
  } catch {
    throw new Error(`Invalid redirect URL: ${location}`);
  }
  return assertUrlAllowed(next.toString());
}

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

function isLocalApiHost(hostname: string, env?: Record<string, unknown>): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_API_HOSTS.has(host)) return true;
  const base = env?.BASE_URL;
  if (typeof base !== 'string' || !base.trim()) return false;
  try {
    return new URL(base).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

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
  env?: Record<string, unknown>,
): HttpRequestResult | null {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/hooks/echo') return null;
  if (!isLocalApiHost(url.hostname, env)) return null;

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

/** In-process GET /public/plans — same 522 avoidance as /hooks/echo. */
function tryLocalPublicPlans(
  url: URL,
  method: string,
  env?: Record<string, unknown>,
): HttpRequestResult | null {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/public/plans') return null;
  if (!isLocalApiHost(url.hostname, env)) return null;

  const payload = publicPlansCatalog(env as { PAYPAL_BILLING_ENABLED?: string } | undefined);
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
  env?: Record<string, unknown>,
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

  const localEcho = tryLocalEcho(url, method, headers, body, env);
  if (localEcho) return localEcho;
  const localPlans = tryLocalPublicPlans(url, method, env);
  if (localPlans) return localPlans;

  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Number(data.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    let currentMethod = method;
    let currentBody = body;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_HTTP_REDIRECTS; hop += 1) {
      res = await fetch(currentUrl.toString(), {
        method: currentMethod,
        headers,
        body: currentMethod === 'GET' || currentMethod === 'HEAD' ? undefined : currentBody,
        signal: controller.signal,
        redirect: 'manual',
      });
      const redirected = res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308;
      const location = res.headers.get('location');
      if (!redirected || !location || hop === MAX_HTTP_REDIRECTS) break;
      currentUrl = resolveHttpRedirect(currentUrl.toString(), location);
      if (res.status === 301 || res.status === 302 || res.status === 303) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
    }
    if (!res) throw new Error('HTTP request failed');
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
