/**
 * Scale-safety Phase B — KV kill-switches for sync pause (tables / user).
 * @see docs/scale-safety-million-users-spec.md §9
 */

import {
  PAUSE_USER_DEFAULT_TTL_SEC,
  PAUSE_USER_MAX_TTL_SEC,
  SYNC_PAUSE_TABLES_KEY,
  SYNC_PAUSE_USERS_INDEX_KEY,
  syncPauseUserKey,
} from './scale-safety.js';

export type SyncPauseStatus = {
  pauseTables: string[];
  pauseUsers: Array<{ userId: string; reason?: string; by?: string; at?: number; ttlSec?: number }>;
};

export type PauseUserRecord = {
  reason?: string;
  by?: string;
  at: number;
};

function asKv(env: { SYSTEM_CONFIG_KV?: KVNamespace }): KVNamespace | null {
  return env.SYSTEM_CONFIG_KV ?? null;
}

export async function readPauseTables(env: { SYSTEM_CONFIG_KV?: KVNamespace }): Promise<string[]> {
  const kv = asKv(env);
  if (!kv) return [];
  try {
    const raw = await kv.get(SYNC_PAUSE_TABLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string' && t.length > 0);
  } catch {
    return [];
  }
}

export async function isTablePaused(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
  table: string,
): Promise<boolean> {
  const tables = await readPauseTables(env);
  return tables.includes(table);
}

export async function isUserPaused(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
  userId: string,
): Promise<boolean> {
  const kv = asKv(env);
  if (!kv || !userId) return false;
  try {
    const raw = await kv.get(syncPauseUserKey(userId));
    return !!raw;
  } catch {
    return false;
  }
}

export async function readPauseUsersIndex(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
): Promise<string[]> {
  const kv = asKv(env);
  if (!kv) return [];
  try {
    const raw = await kv.get(SYNC_PAUSE_USERS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string' && t.length > 0);
  } catch {
    return [];
  }
}

export async function getSyncPauseStatus(env: {
  SYSTEM_CONFIG_KV?: KVNamespace;
}): Promise<SyncPauseStatus> {
  const pauseTables = await readPauseTables(env);
  const ids = await readPauseUsersIndex(env);
  const kv = asKv(env);
  const pauseUsers: SyncPauseStatus['pauseUsers'] = [];
  if (kv) {
    for (const userId of ids.slice(0, 100)) {
      try {
        const raw = await kv.get(syncPauseUserKey(userId));
        if (!raw) continue;
        let record: PauseUserRecord = { at: Date.now() };
        try {
          const parsed = JSON.parse(raw) as PauseUserRecord;
          if (parsed && typeof parsed === 'object') record = { ...record, ...parsed };
        } catch {
          /* plain "1" */
        }
        pauseUsers.push({
          userId,
          reason: record.reason,
          by: record.by,
          at: record.at,
        });
      } catch {
        /* skip */
      }
    }
  }
  return { pauseTables, pauseUsers };
}

export async function setPauseTables(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
  tables: string[],
  allowedTables: readonly string[],
): Promise<string[]> {
  const kv = asKv(env);
  if (!kv) throw new Error('SYSTEM_CONFIG_KV binding missing');
  const allowed = new Set(allowedTables);
  const cleaned = [...new Set(tables.map((t) => t.trim()).filter((t) => allowed.has(t)))];
  if (cleaned.length === 0) {
    await kv.delete(SYNC_PAUSE_TABLES_KEY);
  } else {
    await kv.put(SYNC_PAUSE_TABLES_KEY, JSON.stringify(cleaned));
  }
  return cleaned;
}

export async function setPauseUser(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
  input: { userId: string; by: string; reason?: string; ttlSec?: number },
): Promise<{ userId: string; ttlSec: number }> {
  const kv = asKv(env);
  if (!kv) throw new Error('SYSTEM_CONFIG_KV binding missing');
  const ttlSec = Math.min(
    PAUSE_USER_MAX_TTL_SEC,
    Math.max(60, input.ttlSec ?? PAUSE_USER_DEFAULT_TTL_SEC),
  );
  const record: PauseUserRecord = {
    at: Date.now(),
    by: input.by,
    reason: input.reason?.slice(0, 200),
  };
  await kv.put(syncPauseUserKey(input.userId), JSON.stringify(record), { expirationTtl: ttlSec });
  const index = await readPauseUsersIndex(env);
  if (!index.includes(input.userId)) {
    const next = [...index, input.userId].slice(-200);
    await kv.put(SYNC_PAUSE_USERS_INDEX_KEY, JSON.stringify(next), {
      expirationTtl: PAUSE_USER_MAX_TTL_SEC + 60,
    });
  }
  return { userId: input.userId, ttlSec };
}

export async function clearPauseUser(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
  userId: string,
): Promise<void> {
  const kv = asKv(env);
  if (!kv) throw new Error('SYSTEM_CONFIG_KV binding missing');
  await kv.delete(syncPauseUserKey(userId));
  const index = await readPauseUsersIndex(env);
  const next = index.filter((id) => id !== userId);
  if (next.length === 0) await kv.delete(SYNC_PAUSE_USERS_INDEX_KEY);
  else await kv.put(SYNC_PAUSE_USERS_INDEX_KEY, JSON.stringify(next));
}
