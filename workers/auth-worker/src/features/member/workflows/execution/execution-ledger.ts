/**
 * Phase B.1 — slim execution ledger for Queue/D1/R2 (no control-plane state).
 * @see docs/scale-safety-million-users-spec.md §10 Phase B.1
 */

const LEDGER_OMIT_KEYS = ['state', 'input', 'output', 'pendingNodeId'] as const;
const LEDGER_ERROR_MAX = 500;

/** Fields that warrant re-enqueue to D1 (not state/I/O-only persist ticks). */
const LEDGER_SYNC_KEYS = [
  'status',
  'totalCostVnd',
  'totalCreditsCharged',
  'totalCreditsRoyalty',
  'totalRoyaltyUsd',
  'finishedAt',
  'workflowName',
] as const;

export function slimWorkflowExecutionForQueue(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const slim: Record<string, unknown> = { ...record };
  for (const key of LEDGER_OMIT_KEYS) {
    delete slim[key];
  }
  if (typeof slim.error === 'string' && slim.error.length > LEDGER_ERROR_MAX) {
    slim.error = slim.error.slice(0, LEDGER_ERROR_MAX);
  }
  return slim;
}

/** True when an update patch should mark queueStatus=pending for ledger sync. */
export function executionPatchShouldSyncLedger(data: Record<string, unknown>): boolean {
  return LEDGER_SYNC_KEYS.some((key) => data[key] !== undefined);
}
