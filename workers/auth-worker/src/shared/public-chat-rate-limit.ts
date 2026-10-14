import { shouldPersistIpRateLimit } from './ip-rate-limit';

/** Anonymous production chat. Separate from the 600/minute flood ceiling. */
export const PUBLIC_CHAT_RATE_LIMIT = {
  MAX: 20,
  WINDOW_MS: 10 * 60 * 1000,
  BLOCK_MS: 10 * 60 * 1000,
} as const;

type ChatWindow = {
  windowStart: number;
  count: number;
  blockUntil: number;
  lastKvWriteAt: number;
};

const memory = new Map<string, ChatWindow>();
const MEMORY_MAX = 2_000;

export function resetPublicChatRateLimitMemory(): void {
  memory.clear();
}

function storageKey(ip: string): string {
  return `rate_limit:public_chat:${ip}`;
}

function retryAfterSeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function readWindow(raw: string): ChatWindow | undefined {
  try {
    const value = JSON.parse(raw) as Partial<ChatWindow>;
    if (typeof value.windowStart !== 'number' || typeof value.count !== 'number') return undefined;
    return {
      windowStart: value.windowStart,
      count: value.count,
      blockUntil: typeof value.blockUntil === 'number' ? value.blockUntil : 0,
      lastKvWriteAt: typeof value.lastKvWriteAt === 'number' ? value.lastKvWriteAt : 0,
    };
  } catch {
    return undefined;
  }
}

async function persist(env: Env, ip: string, entry: ChatWindow, now: number, force: boolean): Promise<void> {
  if (!env.NONCE_KV) return;
  if (!shouldPersistIpRateLimit({ lastKvWriteAt: entry.lastKvWriteAt, now, force })) return;
  entry.lastKvWriteAt = now;
  memory.set(ip, entry);
  try {
    await env.NONCE_KV.put(storageKey(ip), JSON.stringify(entry), { expirationTtl: 60 * 60 });
  } catch {
    /* This isolate still enforces the window. */
  }
}

/** Count anonymous chat posts per IP. Returns a 429 payload when the window is full. */
export async function trackPublicChatPost(
  env: Env,
  ip: string | null | undefined,
  now = Date.now(),
): Promise<{ blocked: true; retryAfter: number } | null> {
  if (!ip) return null;

  let entry = memory.get(ip);
  if (!entry && env.NONCE_KV) {
    try {
      const raw = await env.NONCE_KV.get(storageKey(ip));
      if (raw) entry = readWindow(raw);
    } catch {
      entry = undefined;
    }
  }

  if (entry && entry.blockUntil > now) {
    memory.set(ip, entry);
    return { blocked: true, retryAfter: retryAfterSeconds(entry.blockUntil, now) };
  }

  if (!entry || now - entry.windowStart >= PUBLIC_CHAT_RATE_LIMIT.WINDOW_MS) {
    entry = {
      windowStart: now,
      count: 0,
      blockUntil: 0,
      lastKvWriteAt: entry?.lastKvWriteAt ?? 0,
    };
  }

  entry.count += 1;
  if (entry.count > PUBLIC_CHAT_RATE_LIMIT.MAX) {
    entry.blockUntil = now + PUBLIC_CHAT_RATE_LIMIT.BLOCK_MS;
    memory.set(ip, entry);
    await persist(env, ip, entry, now, true);
    return { blocked: true, retryAfter: retryAfterSeconds(entry.blockUntil, now) };
  }

  memory.set(ip, entry);
  if (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest && oldest !== ip) memory.delete(oldest);
  }
  await persist(env, ip, entry, now, false);
  return null;
}
