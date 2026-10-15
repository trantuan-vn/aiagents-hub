import { shouldPersistIpRateLimit } from './ip-rate-limit';

/** Guest composer on /support. Separate from the 20-post public-chat ceiling. */
export const SITE_SUPPORT_RATE_LIMIT = {
  WINDOW_MAX: 10,
  WINDOW_MS: 10 * 60 * 1000,
  BLOCK_MS: 10 * 60 * 1000,
  DAILY_MAX: 30,
  /** After this many workflow replies, further questions stay on the page. */
  LIFETIME_MAX: 100,
} as const;

export const SITE_SUPPORT_LIMIT_CODE = {
  window: 'site_support_window',
  daily: 'site_support_daily',
} as const;

/** Fallback bubble when the page does not localize `accountGate`. */
export const SITE_SUPPORT_ACCOUNT_GATE_OUTPUT = [
  'You have asked quite a few questions as a guest. Open a free account to keep exploring workflows, Credits, and plans.',
  '__support_cta__ signup',
].join('\n');

const KV_TTL_SEC = 400 * 24 * 60 * 60;

type Quota = {
  windowStart: number;
  windowCount: number;
  blockUntil: number;
  dayStart: number;
  dayCount: number;
  lifetime: number;
  lastKvWriteAt: number;
};

export type SiteSupportPostDecision =
  | { kind: 'blocked'; retryAfter: number; code: (typeof SITE_SUPPORT_LIMIT_CODE)[keyof typeof SITE_SUPPORT_LIMIT_CODE] }
  | { kind: 'account_gate' };

const memory = new Map<string, Quota>();
const MEMORY_MAX = 2_000;

export function resetSiteSupportRateLimitMemory(): void {
  memory.clear();
}

function storageKey(ip: string): string {
  return `rate_limit:site_support:${ip}`;
}

function utcDayStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function retryAfterSeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function secondsUntilNextUtcDay(now: number): number {
  return retryAfterSeconds(utcDayStart(now) + 24 * 60 * 60 * 1000, now);
}

function emptyQuota(now: number): Quota {
  return {
    windowStart: now,
    windowCount: 0,
    blockUntil: 0,
    dayStart: utcDayStart(now),
    dayCount: 0,
    lifetime: 0,
    lastKvWriteAt: 0,
  };
}

function readQuota(raw: string): Quota | undefined {
  try {
    const value = JSON.parse(raw) as Partial<Quota>;
    if (typeof value.windowStart !== 'number' || typeof value.windowCount !== 'number') return undefined;
    if (typeof value.dayStart !== 'number' || typeof value.dayCount !== 'number') return undefined;
    if (typeof value.lifetime !== 'number') return undefined;
    return {
      windowStart: value.windowStart,
      windowCount: value.windowCount,
      blockUntil: typeof value.blockUntil === 'number' ? value.blockUntil : 0,
      dayStart: value.dayStart,
      dayCount: value.dayCount,
      lifetime: value.lifetime,
      lastKvWriteAt: typeof value.lastKvWriteAt === 'number' ? value.lastKvWriteAt : 0,
    };
  } catch {
    return undefined;
  }
}

async function persist(env: Env, ip: string, entry: Quota, now: number, force: boolean): Promise<void> {
  if (!env.NONCE_KV) return;
  if (!shouldPersistIpRateLimit({ lastKvWriteAt: entry.lastKvWriteAt, now, force })) return;
  entry.lastKvWriteAt = now;
  memory.set(ip, entry);
  try {
    await env.NONCE_KV.put(storageKey(ip), JSON.stringify(entry), { expirationTtl: KV_TTL_SEC });
  } catch {
    /* This isolate still enforces the quota. */
  }
}

function remember(ip: string, entry: Quota): void {
  memory.set(ip, entry);
  if (memory.size <= MEMORY_MAX) return;
  const oldest = memory.keys().next().value;
  if (oldest && oldest !== ip) memory.delete(oldest);
}

function rollWindow(entry: Quota, now: number): void {
  if (now - entry.windowStart < SITE_SUPPORT_RATE_LIMIT.WINDOW_MS) return;
  entry.windowStart = now;
  entry.windowCount = 0;
  entry.blockUntil = 0;
}

function rollDay(entry: Quota, now: number): void {
  const dayStart = utcDayStart(now);
  if (entry.dayStart === dayStart) return;
  entry.dayStart = dayStart;
  entry.dayCount = 0;
}

/**
 * Count one guest support question.
 * `null` means the workflow may run.
 * `account_gate` means reply on the page — the lifetime quota is already spent.
 */
export async function trackSiteSupportPost(
  env: Env,
  ip: string | null | undefined,
  now = Date.now(),
): Promise<SiteSupportPostDecision | null> {
  if (!ip) return null;

  let entry = memory.get(ip);
  if (!entry && env.NONCE_KV) {
    try {
      const raw = await env.NONCE_KV.get(storageKey(ip));
      if (raw) entry = readQuota(raw);
    } catch {
      entry = undefined;
    }
  }
  if (!entry) entry = emptyQuota(now);

  if (entry.lifetime >= SITE_SUPPORT_RATE_LIMIT.LIFETIME_MAX) {
    remember(ip, entry);
    return { kind: 'account_gate' };
  }

  if (entry.blockUntil > now) {
    remember(ip, entry);
    return {
      kind: 'blocked',
      retryAfter: retryAfterSeconds(entry.blockUntil, now),
      code: SITE_SUPPORT_LIMIT_CODE.window,
    };
  }

  rollWindow(entry, now);
  rollDay(entry, now);

  if (entry.dayCount >= SITE_SUPPORT_RATE_LIMIT.DAILY_MAX) {
    remember(ip, entry);
    return {
      kind: 'blocked',
      retryAfter: secondsUntilNextUtcDay(now),
      code: SITE_SUPPORT_LIMIT_CODE.daily,
    };
  }

  entry.windowCount += 1;
  if (entry.windowCount > SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX) {
    entry.blockUntil = now + SITE_SUPPORT_RATE_LIMIT.BLOCK_MS;
    remember(ip, entry);
    await persist(env, ip, entry, now, true);
    return {
      kind: 'blocked',
      retryAfter: retryAfterSeconds(entry.blockUntil, now),
      code: SITE_SUPPORT_LIMIT_CODE.window,
    };
  }

  entry.dayCount += 1;
  entry.lifetime += 1;
  remember(ip, entry);
  await persist(env, ip, entry, now, false);
  return null;
}
