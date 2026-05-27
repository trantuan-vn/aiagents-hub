import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { AUTH_CONSTANTS, ERROR_MESSAGES } from '../features/auth/constant';
import { getClientIp } from './utils';
import { applyCorsHeadersIfAllowed } from './cors-headers';
import { isAuthBootstrapGet } from './dashboard-public-paths';

/** Per-IP request flood limit (all routes). */
export const IP_RATE_LIMIT = {
  /** ~10 req/s trung bình mỗi IP (khớp mức free tier trên tài liệu sản phẩm). */
  REQUEST_LIMIT_MAX: 600,
  REQUEST_WINDOW_MS: 60_000,
  REQUEST_BURST_BLOCK_MS: 5 * 60 * 1000,
  /** Higher ceiling when session cookie present (still rate-limited). */
  AUTHENTICATED_REQUEST_LIMIT_MAX: 6_000,
  /** Cap any IP block (flood or auth) — legacy bug could set 24h blocks. */
  MAX_BLOCK_MS: 15 * 60 * 1000,
  KV_TTL_SEC: 24 * 60 * 60,
} as const;

export type IpRateLimitRecord = {
  failCount: number;
  blockUntil: number;
  lastAttempt: number;
  windowStart?: number;
  requestCount?: number;
};

export function ipRateLimitKey(ip: string): string {
  return `rate_limit:${ip}`;
}

/** Login / OAuth bootstrap — không áp flood counter của toàn dashboard API. */
export function isAuthLoginPath(path: string): boolean {
  return path.startsWith('/dashboard/auth');
}

export { isAuthBootstrapGet } from './dashboard-public-paths';

function blockDurationForFailCount(failCount: number): number {
  let blockDuration = 5 * 60 * 1000;
  if (failCount >= 8) blockDuration = 10 * 60 * 1000;
  if (failCount >= 12) blockDuration = IP_RATE_LIMIT.MAX_BLOCK_MS;
  return blockDuration;
}

function capBlockUntil(blockUntil: number, now: number): number {
  if (blockUntil <= now) return blockUntil;
  return Math.min(blockUntil, now + IP_RATE_LIMIT.MAX_BLOCK_MS);
}

function retryAfterSeconds(record: IpRateLimitRecord, now = Date.now()): number {
  return Math.max(1, Math.ceil((record.blockUntil - now) / 1000));
}

export function isIpCurrentlyBlocked(record: IpRateLimitRecord | null, now = Date.now()): boolean {
  if (!record) return false;
  return now < record.blockUntil;
}

async function saveIpRateLimitRecord(env: Env, ip: string, record: IpRateLimitRecord): Promise<void> {
  await env.NONCE_KV.put(ipRateLimitKey(ip), JSON.stringify(record), {
    expirationTtl: IP_RATE_LIMIT.KV_TTL_SEC,
  });
}

/** Read record; migrate legacy key (raw IP) to `rate_limit:${ip}`. */
export async function getIpRateLimitRecord(env: Env, ip: string): Promise<IpRateLimitRecord | null> {
  const key = ipRateLimitKey(ip);
  let raw = await env.NONCE_KV.get(key);
  if (!raw) {
    raw = await env.NONCE_KV.get(ip);
    if (raw) {
      await env.NONCE_KV.put(key, raw, { expirationTtl: IP_RATE_LIMIT.KV_TTL_SEC });
      await env.NONCE_KV.delete(ip);
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IpRateLimitRecord;
  } catch {
    return null;
  }
}

/** Heal KV rows from the old handleError bug (24h blocks, inflated failCount). */
async function getHealedIpRateLimitRecord(env: Env, ip: string): Promise<IpRateLimitRecord | null> {
  const record = await getIpRateLimitRecord(env, ip);
  if (!record) return null;

  const now = Date.now();
  if (record.blockUntil > 0 && now >= record.blockUntil) {
    await env.NONCE_KV.delete(ipRateLimitKey(ip));
    return null;
  }

  const remaining = record.blockUntil > 0 ? record.blockUntil - now : 0;
  const needsHeal =
    remaining > IP_RATE_LIMIT.MAX_BLOCK_MS ||
    record.failCount > AUTH_CONSTANTS.RATE_LIMIT_MAX * 4;

  if (!needsHeal) return record;

  const healed: IpRateLimitRecord = {
    failCount: Math.min(record.failCount, AUTH_CONSTANTS.RATE_LIMIT_MAX - 1),
    blockUntil: remaining > IP_RATE_LIMIT.MAX_BLOCK_MS ? 0 : record.blockUntil,
    lastAttempt: now,
    windowStart: record.windowStart,
    requestCount: record.requestCount,
  };
  await saveIpRateLimitRecord(env, ip, healed);
  return healed;
}

export async function checkIpBlocked(
  env: Env,
  ip: string,
  options?: { authLoginPath?: boolean },
): Promise<{ blocked: true; retryAfter: number } | { blocked: false }> {
  if (!ip) return { blocked: false };

  const now = Date.now();
  const record = await getHealedIpRateLimitRecord(env, ip);

  if (!record) return { blocked: false };

  if (options?.authLoginPath) {
    // Chỉ chặn login khi đủ lỗi xác thực — không chặn vì flood từ dashboard/API khác.
    if (record.failCount < AUTH_CONSTANTS.RATE_LIMIT_MAX) {
      return { blocked: false };
    }
  } else if (isIpCurrentlyBlocked(record, now)) {
    const authBlocked = record.failCount >= AUTH_CONSTANTS.RATE_LIMIT_MAX;
    const floodBlocked = (record.requestCount ?? 0) > IP_RATE_LIMIT.REQUEST_LIMIT_MAX;
    if (!authBlocked && !floodBlocked) {
      await env.NONCE_KV.delete(ipRateLimitKey(ip));
      return { blocked: false };
    }
    return { blocked: true, retryAfter: retryAfterSeconds(record, now) };
  }

  return { blocked: false };
}

/**
 * Count each request per IP; block on burst flood.
 * Returns block info if the request must be rejected.
 */
export async function trackIpRequest(
  env: Env,
  ip: string,
  path: string,
  options?: { requestLimitMax?: number },
): Promise<{ blocked: true; retryAfter: number } | null> {
  const requestLimitMax = options?.requestLimitMax ?? IP_RATE_LIMIT.REQUEST_LIMIT_MAX;
  if (!ip || isAuthLoginPath(path)) return null;

  const now = Date.now();
  let record = await getHealedIpRateLimitRecord(env, ip);

  if (record && isIpCurrentlyBlocked(record, now)) {
    return { blocked: true, retryAfter: retryAfterSeconds(record, now) };
  }

  if (!record) {
    record = {
      failCount: 0,
      blockUntil: 0,
      lastAttempt: now,
      windowStart: now,
      requestCount: 0,
    };
  }

  const windowMs = IP_RATE_LIMIT.REQUEST_WINDOW_MS;
  const windowStart = record.windowStart ?? now;
  if (now - windowStart > windowMs) {
    record.windowStart = now;
    record.requestCount = 1;
  } else {
    record.requestCount = (record.requestCount ?? 0) + 1;
  }

  if ((record.requestCount ?? 0) > requestLimitMax) {
    record.blockUntil = capBlockUntil(now + IP_RATE_LIMIT.REQUEST_BURST_BLOCK_MS, now);
    record.lastAttempt = now;
    await saveIpRateLimitRecord(env, ip, record);
    return { blocked: true, retryAfter: retryAfterSeconds(record, now) };
  }

  record.lastAttempt = now;
  await saveIpRateLimitRecord(env, ip, record);
  return null;
}

/** Auth / validation failures — escalating block only after repeated failures. */
export async function recordIpAuthFailure(env: Env, ip: string): Promise<void> {
  if (!ip) return;

  const now = Date.now();
  const existing = await getIpRateLimitRecord(env, ip);

  const failCount = (existing?.failCount ?? 0) + 1;
  let blockUntil = existing?.blockUntil ?? 0;

  if (failCount >= AUTH_CONSTANTS.RATE_LIMIT_MAX) {
    const shortBlock = now + AUTH_CONSTANTS.RATE_LIMIT_WINDOW;
    blockUntil = Math.max(blockUntil, shortBlock);
    const escalated = now + blockDurationForFailCount(failCount);
    if (escalated > blockUntil) blockUntil = escalated;
    blockUntil = capBlockUntil(blockUntil, now);
  }

  const record: IpRateLimitRecord = {
    failCount,
    blockUntil,
    lastAttempt: now,
    windowStart: existing?.windowStart,
    requestCount: existing?.requestCount,
  };

  await saveIpRateLimitRecord(env, ip, record);
}

function rateLimitExceededResponse(c: Context, retryAfter: number) {
  applyCorsHeadersIfAllowed(c);
  return c.json(
    {
      error: ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED,
      retryAfter,
    },
    429,
  );
}

/** Global per-IP flood + auth-failure blocks (all routes). */
export function createIpRateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    // CORS preflight must return 2xx; counting OPTIONS breaks cross-origin fetch.
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const ip = getClientIp(c);
    if (!ip) {
      await next();
      return;
    }

    const path = c.req.path;
    const method = c.req.method;

    if (isAuthBootstrapGet(method, path)) {
      await next();
      return;
    }

    const authLoginPath = isAuthLoginPath(path);

    const hasSessionCookie =
      path.startsWith('/dashboard/') && !authLoginPath && !!getCookie(c, 'sessionId');

    const blocked = await checkIpBlocked(c.env, ip, { authLoginPath });
    if (blocked.blocked) {
      return rateLimitExceededResponse(c, blocked.retryAfter);
    }

    const flood = await trackIpRequest(c.env, ip, path, {
      requestLimitMax: hasSessionCookie
        ? IP_RATE_LIMIT.AUTHENTICATED_REQUEST_LIMIT_MAX
        : undefined,
    });
    if (flood) {
      return rateLimitExceededResponse(c, flood.retryAfter);
    }

    await next();
  };
}
