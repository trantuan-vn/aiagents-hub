/**
 * Scale-safety Phase A — pending caps, backpressure, processed cleanup thresholds.
 * @see docs/scale-safety-million-users-spec.md §4.1 / Phase A
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

/** Billing / money T1 tables gated on hard pending. */
export const T1_PENDING_GATE_TABLES = [
  'service_usages',
  'orders',
  'payments',
  'refunds',
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
