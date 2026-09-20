/**
 * Isolate-memory cache for hot KV reads (system config, membership tiers).
 * Cached `get()` still counts as a billable KV read — skipping get() is the point.
 * Request-scoped data must not go here.
 */
export const SYSTEM_CONFIG_CACHE_TTL_MS = 60_000;

type KvGet = { get(key: string): Promise<string | null> };

type Entry = { value: string | null; expiresAt: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

export async function getKvTextCached(
  kv: KvGet,
  key: string,
  ttlMs: number = SYSTEM_CONFIG_CACHE_TTL_MS,
): Promise<string | null> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let pending = inflight.get(key);
  if (!pending) {
    pending = kv
      .get(key)
      .then((value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }
  return pending;
}

export function setKvTextCached(
  key: string,
  value: string | null,
  ttlMs: number = SYSTEM_CONFIG_CACHE_TTL_MS,
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateKvCache(key?: string): void {
  if (key) {
    store.delete(key);
    return;
  }
  store.clear();
}
