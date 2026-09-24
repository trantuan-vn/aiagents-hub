import {
  DO_PROBE_MAX_PER_WINDOW,
  DO_PROBE_TIMEOUT_MS,
  DO_PROBE_WINDOW_MS,
  DLQ_REPLAY_DAILY_CAP,
  DLQ_REPLAY_KV_PREFIX,
  DLQ_REPLAY_MIN_INTERVAL_MS,
  FORCE_FLUSH_KV_PREFIX,
  FORCE_FLUSH_MIN_INTERVAL_MS,
  INTERNAL_TRIGGER_HEADER,
  INTERNAL_TRIGGER_VALUE,
  PIPELINE_ARCHIVE_TABLES,
  PROBE_COUNT_KV_PREFIX,
  PipelineHealthError,
  RERUN_ALL_MIN_INTERVAL_MS,
  RERUN_KV_PREFIX,
  RERUN_TABLE_MIN_INTERVAL_MS,
  SYNC_TABLE_NAMES,
  isValidDoUserId,
} from './domain.js';
import { getDlqEntry, markDlqReplayed, writeAudit } from './store.js';
import {
  clearPauseUser,
  setPauseTables,
  setPauseUser,
} from '../../ws/infrastructure/sync-pause.js';

type D1tor2TriggerStats = {
  totalPipelines: number;
  successful: number;
  failed: number;
  results: Array<{
    pipelineName: string;
    tableName: string;
    success: boolean;
    recordsProcessed: number;
    error?: string;
  }>;
};

async function assertKvCooldown(env: Env, key: string, minIntervalMs: number, message: string): Promise<void> {
  const lastRaw = await env.SYSTEM_CONFIG_KV?.get(key);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (Number.isFinite(last) && last > 0 && Date.now() - last < minIntervalMs) {
    const waitSec = Math.ceil((minIntervalMs - (Date.now() - last)) / 1000);
    throw new PipelineHealthError('rate_limited', `${message} (retry in ~${waitSec}s)`, 429);
  }
}

async function markKvCooldown(env: Env, key: string, minIntervalMs: number): Promise<void> {
  await env.SYSTEM_CONFIG_KV?.put(key, String(Date.now()), {
    expirationTtl: Math.max(60, Math.ceil(minIntervalMs / 1000) + 60),
  });
}

export async function assertProbeBudget(env: Env, actor: string): Promise<void> {
  const windowKey = `${PROBE_COUNT_KV_PREFIX}${actor}:${Math.floor(Date.now() / DO_PROBE_WINDOW_MS)}`;
  const raw = await env.SYSTEM_CONFIG_KV?.get(windowKey);
  const count = raw ? Number(raw) : 0;
  if (Number.isFinite(count) && count >= DO_PROBE_MAX_PER_WINDOW) {
    throw new PipelineHealthError(
      'rate_limited',
      `DO probe limited to ${DO_PROBE_MAX_PER_WINDOW} per 5 minutes`,
      429,
    );
  }
  await env.SYSTEM_CONFIG_KV?.put(windowKey, String((Number.isFinite(count) ? count : 0) + 1), {
    expirationTtl: Math.ceil(DO_PROBE_WINDOW_MS / 1000) + 60,
  });
}

export async function forceFlushUser(
  env: Env,
  actor: string,
  input: { userId: string; table?: string; confirm?: boolean; force?: boolean },
): Promise<{ ok: true; userId: string; table: string | null; response: unknown }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  const userId = input.userId?.trim() ?? '';
  if (!isValidDoUserId(userId)) {
    throw new PipelineHealthError('invalid_user_id', 'userId must be a 64-char Durable Object id', 400);
  }
  const table = input.table?.trim() || null;
  if (table && !(SYNC_TABLE_NAMES as readonly string[]).includes(table)) {
    throw new PipelineHealthError('invalid_table', `Table ${table} is not a sync table`, 400);
  }
  if (!env.USER_DO) {
    throw new PipelineHealthError('binding_missing', 'USER_DO binding missing', 503);
  }

  await assertKvCooldown(
    env,
    `${FORCE_FLUSH_KV_PREFIX}${userId}`,
    FORCE_FLUSH_MIN_INTERVAL_MS,
    'Force flush is limited to once per user every 5 minutes',
  );

  const stub = env.USER_DO.get(env.USER_DO.idFromString(userId));
  let res: Response;
  try {
    res = await stub.fetch('https://do.internal/queue/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: table ?? undefined, force: input.force !== false }),
      signal: AbortSignal.timeout(DO_PROBE_TIMEOUT_MS * 5),
    });
  } catch (e) {
    throw new PipelineHealthError(
      'action_failed',
      e instanceof Error ? e.message : 'Force flush request failed',
      503,
    );
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new PipelineHealthError(
      'action_failed',
      `UserDO flush returned ${res.status}: ${typeof json === 'object' && json && 'error' in json ? String((json as { error?: string }).error) : text.slice(0, 200)}`,
      503,
    );
  }
  await markKvCooldown(env, `${FORCE_FLUSH_KV_PREFIX}${userId}`, FORCE_FLUSH_MIN_INTERVAL_MS);
  if (env.D1DB) {
    await writeAudit(env.D1DB, actor, 'force_flush', JSON.stringify({ userId, table, force: input.force !== false }));
  }
  return { ok: true, userId, table, response: json };
}

function getD1tor2Fetcher(env: Env): Fetcher | null {
  const binding = (env as Env & { D1TOR2_CRON?: Fetcher }).D1TOR2_CRON;
  return binding ?? null;
}

export async function rerunPipeline(
  env: Env,
  actor: string,
  input: { table?: string | null; all?: boolean; confirm?: boolean },
): Promise<{ ok: true; scope: string; stats: D1tor2TriggerStats }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  const table = input.table?.trim() || null;
  const runAll = input.all === true || !table;
  if (table && !(PIPELINE_ARCHIVE_TABLES as readonly string[]).includes(table)) {
    throw new PipelineHealthError(
      'invalid_table',
      `Table ${table} is not an archive pipeline table (${PIPELINE_ARCHIVE_TABLES.join(', ')})`,
      400,
    );
  }

  const fetcher = getD1tor2Fetcher(env);
  if (!fetcher) {
    throw new PipelineHealthError(
      'binding_missing',
      'D1TOR2_CRON service binding missing — add services binding in auth-worker wrangler',
      503,
    );
  }

  const cooldownKey = runAll ? `${RERUN_KV_PREFIX}all` : `${RERUN_KV_PREFIX}table:${table}`;
  const cooldownMs = runAll ? RERUN_ALL_MIN_INTERVAL_MS : RERUN_TABLE_MIN_INTERVAL_MS;
  await assertKvCooldown(
    env,
    cooldownKey,
    cooldownMs,
    runAll
      ? 'Full pipeline re-run is limited to once every 10 minutes'
      : 'Per-table re-run is limited to once every 2 minutes',
  );

  let res: Response;
  try {
    res = await fetcher.fetch('https://d1tor2.internal/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_TRIGGER_HEADER]: INTERNAL_TRIGGER_VALUE,
      },
      body: JSON.stringify(runAll ? { all: true } : { table }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    throw new PipelineHealthError(
      'action_failed',
      e instanceof Error ? e.message : 'd1tor2 trigger failed',
      503,
    );
  }

  const text = await res.text();
  let stats: D1tor2TriggerStats;
  try {
    stats = JSON.parse(text) as D1tor2TriggerStats;
  } catch {
    throw new PipelineHealthError('action_failed', `d1tor2 returned non-JSON (${res.status}): ${text.slice(0, 200)}`, 503);
  }
  if (!res.ok) {
    const errMsg =
      typeof stats === 'object' && stats && 'error' in stats
        ? String((stats as unknown as { error?: string }).error)
        : text.slice(0, 200);
    throw new PipelineHealthError('action_failed', errMsg || `d1tor2 HTTP ${res.status}`, res.status === 404 ? 404 : 503);
  }

  await markKvCooldown(env, cooldownKey, cooldownMs);
  if (env.D1DB) {
    await writeAudit(
      env.D1DB,
      actor,
      'rerun_pipeline',
      JSON.stringify({ scope: runAll ? 'all' : table, successful: stats.successful, failed: stats.failed }),
    );
  }
  return { ok: true, scope: runAll ? 'all' : (table as string), stats };
}

/**
 * Controlled DLQ replay: always send a compact pullFromDo pointer (no stored PII body).
 * Rate-limited per entry + daily cap per admin.
 */
export async function replayDlqEntry(
  env: Env,
  actor: string,
  input: { id: number; confirm?: boolean },
): Promise<{ ok: true; id: number; userId: string; table: string; queueId: number }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  if (!env.D1DB) {
    throw new PipelineHealthError('binding_missing', 'D1DB binding missing', 503);
  }
  if (!env.INPUT_QUEUE) {
    throw new PipelineHealthError('binding_missing', 'INPUT_QUEUE binding missing', 503);
  }
  const id = Number(input.id);
  if (!Number.isFinite(id) || id < 1) {
    throw new PipelineHealthError('not_found', 'DLQ entry not found', 404);
  }

  const entry = await getDlqEntry(env.D1DB, id);
  if (!entry) {
    throw new PipelineHealthError('not_found', 'DLQ entry not found', 404);
  }
  if (!entry.canReplay || !entry.userId || !entry.tableName || entry.queueId == null) {
    throw new PipelineHealthError(
      'replay_not_possible',
      'Entry cannot be replayed (missing user/table/queueId or already replayed)',
      400,
    );
  }
  if (!(SYNC_TABLE_NAMES as readonly string[]).includes(entry.tableName)) {
    throw new PipelineHealthError('invalid_table', `Table ${entry.tableName} is not a sync table`, 400);
  }
  if (!isValidDoUserId(entry.userId)) {
    throw new PipelineHealthError('invalid_user_id', 'Stored userId is not a valid Durable Object id', 400);
  }

  await assertKvCooldown(
    env,
    `${DLQ_REPLAY_KV_PREFIX}entry:${id}`,
    DLQ_REPLAY_MIN_INTERVAL_MS,
    'This DLQ entry was replayed recently',
  );

  const dayKey = `${DLQ_REPLAY_KV_PREFIX}day:${actor}:${new Date().toISOString().slice(0, 10)}`;
  const dayRaw = await env.SYSTEM_CONFIG_KV?.get(dayKey);
  const dayCount = dayRaw ? Number(dayRaw) : 0;
  if (Number.isFinite(dayCount) && dayCount >= DLQ_REPLAY_DAILY_CAP) {
    throw new PipelineHealthError(
      'rate_limited',
      `DLQ replay limited to ${DLQ_REPLAY_DAILY_CAP} per admin per day`,
      429,
    );
  }

  const queueId = entry.queueId;
  const userId = entry.userId;
  const table = entry.tableName;
  const payload = [
    {
      body: JSON.stringify({
        table,
        id: queueId,
        pullFromDo: true,
        data: { queueId },
        batchInfo: {
          userId,
          table,
          batchSize: 1,
          minId: queueId,
          maxId: queueId,
          timestamp: Date.now(),
          pullFromDo: true,
          replayFromDlq: id,
        },
      }),
    },
  ];

  try {
    await env.INPUT_QUEUE.send(payload);
  } catch (e) {
    throw new PipelineHealthError(
      'action_failed',
      e instanceof Error ? e.message : 'INPUT_QUEUE.send failed',
      503,
    );
  }

  await markDlqReplayed(env.D1DB, id, actor);
  await markKvCooldown(env, `${DLQ_REPLAY_KV_PREFIX}entry:${id}`, DLQ_REPLAY_MIN_INTERVAL_MS);
  await env.SYSTEM_CONFIG_KV?.put(dayKey, String((Number.isFinite(dayCount) ? dayCount : 0) + 1), {
    expirationTtl: 48 * 60 * 60,
  });
  await writeAudit(
    env.D1DB,
    actor,
    'dlq_replay',
    JSON.stringify({ id, userId, table, queueId, messageId: entry.messageId }),
  );
  return { ok: true, id, userId, table, queueId };
}

export async function setSyncPauseTables(
  env: Env,
  actor: string,
  input: { tables?: string[]; confirm?: boolean },
): Promise<{ ok: true; pauseTables: string[] }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  const tables = Array.isArray(input.tables) ? input.tables : [];
  const pauseTables = await setPauseTables(env, tables, SYNC_TABLE_NAMES);
  if (env.D1DB) {
    await writeAudit(env.D1DB, actor, 'sync.pause_tables', JSON.stringify({ pauseTables }));
  }
  return { ok: true, pauseTables };
}

export async function setSyncPauseUser(
  env: Env,
  actor: string,
  input: { userId?: string; reason?: string; ttlSec?: number; confirm?: boolean },
): Promise<{ ok: true; userId: string; ttlSec: number }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  const userId = input.userId?.trim() ?? '';
  if (!isValidDoUserId(userId)) {
    throw new PipelineHealthError('invalid_user_id', 'userId must be a 64-char Durable Object id', 400);
  }
  const result = await setPauseUser(env, {
    userId,
    by: actor,
    reason: input.reason,
    ttlSec: input.ttlSec,
  });
  if (env.D1DB) {
    await writeAudit(env.D1DB, actor, 'sync.pause_user', JSON.stringify(result));
  }
  return { ok: true, ...result };
}

export async function clearSyncPauseUser(
  env: Env,
  actor: string,
  input: { userId?: string; confirm?: boolean },
): Promise<{ ok: true; userId: string }> {
  if (input.confirm !== true) {
    throw new PipelineHealthError('confirm_required', 'confirm: true is required', 400);
  }
  const userId = input.userId?.trim() ?? '';
  if (!isValidDoUserId(userId)) {
    throw new PipelineHealthError('invalid_user_id', 'userId must be a 64-char Durable Object id', 400);
  }
  await clearPauseUser(env, userId);
  if (env.D1DB) {
    await writeAudit(env.D1DB, actor, 'sync.resume_user', JSON.stringify({ userId }));
  }
  return { ok: true, userId };
}
