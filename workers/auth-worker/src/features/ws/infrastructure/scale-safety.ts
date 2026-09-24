/**
 * Scale-safety Phase A+B — pending caps, backpressure, slow-flush, fairness, sync pause.
 * @see docs/scale-safety-million-users-spec.md §4.1 / Phase A–B
 */

/** Soft pending rows per T1 table — allow write + self-report `pending_high`. */
export const PENDING_SOFT_PER_TABLE = 2_000;
/** Hard pending rows per T1 table — reject write with `backpressure`. */
export const PENDING_HARD_PER_TABLE = 10_000;
/** Soft pending rows across all sync tables for one user. */
export const PENDING_SOFT_PER_USER = 10_000;
/** Hard pending rows across all sync tables for one user. */
export const PENDING_HARD_PER_USER = 50_000;
/** Cleanup `processed` QUEUE rows when count exceeds this even if pending is 0. */
export const PROCESSED_CLEANUP_THRESHOLD = 5_000;
/** Rate-limit UserDO → `pipeline_hot_users` upsert (ms). */
export const PENDING_HIGH_REPORT_INTERVAL_MS = 5 * 60_000;
/** Stale WS connection rows (no lastConnected update) deleted on maintenance. */
export const CONNECTION_STALE_MS = 7 * 86_400_000;
/** Min interval between alarm-driven execution prune + session expire (ms). */
export const MAINTENANCE_MIN_INTERVAL_MS = 6 * 60 * 60_000;

/** Phase B: multiply QUEUE_FLUSH_INTERVAL while user is hot. */
export const SLOW_FLUSH_INTERVAL_MULTIPLIER = 5;
/** Phase B: how long slow-flush stays armed after soft exceed / pending_high. */
export const SLOW_FLUSH_TTL_MS = 15 * 60_000;
/** Phase B: soft fairness — min gap between workflow runs when softExceeded (ms). */
export const WORKFLOW_SOFT_THROTTLE_MS = 30_000;
/** Phase B: default TTL for sync.pause_user KV key (seconds). */
export const PAUSE_USER_DEFAULT_TTL_SEC = 3_600;
/** Phase B: max TTL for sync.pause_user (24h). */
export const PAUSE_USER_MAX_TTL_SEC = 86_400;

/** Billing / money T1 tables gated on hard pending. */
export const T1_PENDING_GATE_TABLES = [
  'service_usages',
  'orders',
  'payments',
  'refunds',
  /** Phase B.1: execution ledger (SYNC catalog, not QUEUE cleanup). */
  'workflow_executions',
] as const;

export type T1PendingGateTable = (typeof T1_PENDING_GATE_TABLES)[number];

export const BACKPRESSURE_REASON = 'backpressure' as const;

export type PendingCapDecision =
  | { ok: true; softExceeded: boolean }
  | { ok: false; reason: typeof BACKPRESSURE_REASON; scope: 'table' | 'user'; tablePending: number; userPending: number };

export function isT1PendingGateTable(table: string): table is T1PendingGateTable {
  return (T1_PENDING_GATE_TABLES as readonly string[]).includes(table);
}

/**
 * Decide whether a new pending write to `table` is allowed.
 * `projectedTable` / `projectedUser` = counts **after** the write (pending + 1 for insert).
 */
export function evaluatePendingCaps(input: {
  table: string;
  tablePendingAfter: number;
  userPendingAfter: number;
}): PendingCapDecision {
  const { table, tablePendingAfter, userPendingAfter } = input;
  if (!isT1PendingGateTable(table)) {
    return {
      ok: true,
      softExceeded:
        tablePendingAfter >= PENDING_SOFT_PER_TABLE || userPendingAfter >= PENDING_SOFT_PER_USER,
    };
  }
  if (tablePendingAfter > PENDING_HARD_PER_TABLE) {
    return {
      ok: false,
      reason: BACKPRESSURE_REASON,
      scope: 'table',
      tablePending: tablePendingAfter,
      userPending: userPendingAfter,
    };
  }
  if (userPendingAfter > PENDING_HARD_PER_USER) {
    return {
      ok: false,
      reason: BACKPRESSURE_REASON,
      scope: 'user',
      tablePending: tablePendingAfter,
      userPending: userPendingAfter,
    };
  }
  return {
    ok: true,
    softExceeded:
      tablePendingAfter >= PENDING_SOFT_PER_TABLE || userPendingAfter >= PENDING_SOFT_PER_USER,
  };
}

export function backpressureErrorMessage(decision: Extract<PendingCapDecision, { ok: false }>): string {
  return `BACKPRESSURE: queue overloaded (${decision.scope} pending table=${decision.tablePending} user=${decision.userPending})`;
}

export function isBackpressureError(message: string): boolean {
  return /backpressure/i.test(message) || message.includes('BACKPRESSURE');
}

export function shouldCleanupProcessed(processedCount: number, threshold = PROCESSED_CLEANUP_THRESHOLD): boolean {
  return processedCount > threshold;
}

/** Effective flush interval (ms) when slow-flush is active. */
export function effectiveFlushInterval(
  baseIntervalMs: number,
  slowActive: boolean,
  multiplier = SLOW_FLUSH_INTERVAL_MULTIPLIER,
): number {
  const base = Math.max(1_000, baseIntervalMs);
  if (!slowActive) return base;
  return base * Math.max(1, multiplier);
}

export function isSlowFlushActive(slowFlushUntil: number | null | undefined, now = Date.now()): boolean {
  return typeof slowFlushUntil === 'number' && Number.isFinite(slowFlushUntil) && slowFlushUntil > now;
}

export function nextSlowFlushUntil(now = Date.now(), ttlMs = SLOW_FLUSH_TTL_MS): number {
  return now + Math.max(60_000, ttlMs);
}

export type WorkflowFairnessDecision =
  | { action: 'allow' }
  | { action: 'throttle'; waitMs: number; code: 'BACKPRESSURE_SOFT' }
  | { action: 'reject'; code: 'BACKPRESSURE'; reason: typeof BACKPRESSURE_REASON };

/**
 * Fairness for workflow run create (Phase B).
 * Hard → reject; soft → throttle by min gap between runs.
 */
export function evaluateWorkflowRunFairness(input: {
  pendingTotal: number;
  softPerUser?: number;
  hardPerUser?: number;
  lastRunAt?: number | null;
  now?: number;
  softThrottleMs?: number;
}): WorkflowFairnessDecision {
  const soft = input.softPerUser ?? PENDING_SOFT_PER_USER;
  const hard = input.hardPerUser ?? PENDING_HARD_PER_USER;
  const now = input.now ?? Date.now();
  const throttleMs = input.softThrottleMs ?? WORKFLOW_SOFT_THROTTLE_MS;

  if (input.pendingTotal > hard) {
    return { action: 'reject', code: 'BACKPRESSURE', reason: BACKPRESSURE_REASON };
  }
  if (input.pendingTotal >= soft) {
    const last = input.lastRunAt ?? 0;
    const elapsed = now - last;
    if (last > 0 && elapsed < throttleMs) {
      return { action: 'throttle', waitMs: throttleMs - elapsed, code: 'BACKPRESSURE_SOFT' };
    }
  }
  return { action: 'allow' };
}

/** KV key for paused sync tables list. */
export const SYNC_PAUSE_TABLES_KEY = 'sync.pause_tables';
/** KV key prefix for paused user: `sync.pause_user:{userId}`. */
export const SYNC_PAUSE_USER_PREFIX = 'sync.pause_user:';
/** Index of paused user ids for UI listing. */
export const SYNC_PAUSE_USERS_INDEX_KEY = 'sync.pause_users';

export function syncPauseUserKey(userId: string): string {
  return `${SYNC_PAUSE_USER_PREFIX}${userId}`;
}
