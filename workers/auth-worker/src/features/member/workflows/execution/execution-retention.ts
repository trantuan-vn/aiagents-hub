/**
 * Phase 3 — prune terminal workflow executions by plan retention limits.
 * Never deletes `running` / `pending_human` (resume-critical).
 *
 * @see docs/workflow-execution-logging-spec.md
 */

import type { PlanEntitlement, PlanId } from '../billing/plan.js';
import { DEFAULT_PLAN_ENTITLEMENTS } from '../billing/plan.js';
import {
  deleteExecution,
  listExecutions,
  type ExecutionRow,
} from './execution-store.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';

const MS_PER_DAY = 86_400_000;

export const ACTIVE_EXECUTION_STATUSES = new Set(['running', 'pending_human']);

export type ExecutionHistoryLimits = {
  max: number;
  days: number;
};

export function executionHistoryLimitsForPlan(planId: PlanId): ExecutionHistoryLimits {
  const e = DEFAULT_PLAN_ENTITLEMENTS[planId];
  return { max: e.executionHistoryMax, days: e.executionHistoryDays };
}

export function executionHistoryLimitsFromEntitlement(
  entitlement: Pick<PlanEntitlement, 'executionHistoryMax' | 'executionHistoryDays'>,
): ExecutionHistoryLimits {
  return {
    max: Math.max(1, entitlement.executionHistoryMax),
    days: Math.max(1, entitlement.executionHistoryDays),
  };
}

function rowAgeMs(row: ExecutionRow, now: number): number {
  const ts = Number(row.finishedAt || row.startedAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return Math.max(0, now - ts);
}

/** Pure selection of row ids to delete (for tests). */
export function selectExecutionIdsToPrune(
  rows: ExecutionRow[],
  limits: ExecutionHistoryLimits,
  now = Date.now(),
): number[] {
  const cutoff = limits.days * MS_PER_DAY;
  const terminal = rows
    .filter((row) => !ACTIVE_EXECUTION_STATUSES.has(String(row.status)))
    .slice()
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));

  const deleteIds: number[] = [];
  let kept = 0;
  for (const row of terminal) {
    const tooOld = rowAgeMs(row, now) > cutoff;
    if (tooOld || kept >= limits.max) {
      deleteIds.push(row.id);
      continue;
    }
    kept += 1;
  }
  return deleteIds;
}

/**
 * Delete terminal executions beyond plan max/days for one workflow.
 * Best-effort: individual delete failures are logged and skipped.
 */
export async function pruneWorkflowExecutionHistory(
  userDO: DurableObjectStub<UserDO>,
  workflowId: number,
  limits: ExecutionHistoryLimits,
  now = Date.now(),
): Promise<{ deleted: number }> {
  const scanLimit = Math.min(2_000, Math.max(limits.max * 3, 100));
  const rows = await listExecutions(userDO, workflowId, scanLimit);
  const ids = selectExecutionIdsToPrune(rows, limits, now);
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteExecution(userDO, id);
      deleted += 1;
    } catch (e) {
      console.warn(
        '[execution-retention] delete failed',
        id,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { deleted };
}
