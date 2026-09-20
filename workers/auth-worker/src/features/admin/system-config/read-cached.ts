import { invalidateKvCache, getKvTextCached, setKvTextCached } from '../../../shared/kv-ttl-cache.js';

import { KV_KEY } from './domain.js';

type KvGet = { get(key: string): Promise<string | null> };

export async function readSystemConfigText(kv: KvGet | undefined): Promise<string | null> {
  if (!kv) return null;
  return getKvTextCached(kv, KV_KEY);
}

export async function readSystemConfigJson(kv: KvGet | undefined): Promise<unknown | null> {
  const raw = await readSystemConfigText(kv);
  if (raw == null || raw === '') return null;
  return JSON.parse(raw);
}

export function rememberSystemConfigText(value: string): void {
  setKvTextCached(KV_KEY, value);
}

export function invalidateSystemConfigCache(): void {
  invalidateKvCache(KV_KEY);
}
