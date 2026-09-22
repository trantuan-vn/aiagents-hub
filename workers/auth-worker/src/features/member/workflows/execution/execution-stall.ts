import { broadcastWorkflowExecutionProgress } from './execution-progress.js';
import { updateExecution, type ExecutionRow } from './execution-store.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';

/**
 * If a durable slice or interactive Worker dies mid-node, status can stay
 * `running` forever because nothing persists a terminal result. Treat long
 * silence on `updated_at` (bumped by every persist/cancel) as a stall.
 *
 * Tuned above typical Save-RAG describeTable LLM latency; still well under
 * the multi-hour zombie runs users see in the Executions UI.
 */
export const EXECUTION_STALL_MS = 12 * 60 * 1000;

export const EXECUTION_STALL_ERROR =
  'Execution stalled (no progress). Network, engine, or AI Gateway may have stopped. Use Resume to continue from the last checkpoint.';

type StallRow = Pick<ExecutionRow, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'workflowId'> & {
  updated_at?: number;
  updatedAt?: number;
};

export function executionProgressAt(row: StallRow, now = Date.now()): number {
  const updated = Number(row.updated_at ?? row.updatedAt ?? 0);
  if (Number.isFinite(updated) && updated > 0) return updated;
  const started = Number(row.startedAt ?? 0);
  if (Number.isFinite(started) && started > 0) return started;
  return now;
}

export function isExecutionStalled(row: StallRow, now = Date.now(), stallMs = EXECUTION_STALL_MS): boolean {
  if (row.status !== 'running') return false;
  if (row.finishedAt) return false;
  return now - executionProgressAt(row, now) >= stallMs;
}

/** Mark a zombie `running` execution failed so the UI can show Resume. */
export async function markExecutionStalled(
  userDO: DurableObjectStub<UserDO>,
  row: StallRow & { executionKey: string },
  error = EXECUTION_STALL_ERROR,
): Promise<ExecutionRow> {
  const finishedAt = Date.now();
  await updateExecution(userDO, row.id, {
    status: 'failed',
    error: error.slice(0, 2000),
    finishedAt,
    pendingNodeId: '',
  });
  try {
    await broadcastWorkflowExecutionProgress(userDO, {
      workflowId: row.workflowId,
      executionKey: row.executionKey,
      type: 'finished',
      status: 'failed',
    });
  } catch {
    /* best-effort */
  }
  return {
    ...(row as ExecutionRow),
    status: 'failed',
    error: error.slice(0, 2000),
    finishedAt,
    pendingNodeId: '',
  };
}

/** Fail stalled rows in a list (mutates via DO updates). */
export async function resolveStalledExecutions(
  userDO: DurableObjectStub<UserDO>,
  rows: ExecutionRow[],
  now = Date.now(),
): Promise<ExecutionRow[]> {
  const out: ExecutionRow[] = [];
  for (const row of rows) {
    if (!isExecutionStalled(row, now)) {
      out.push(row);
      continue;
    }
    try {
      out.push(await markExecutionStalled(userDO, row));
    } catch (e) {
      console.warn(
        '[execution-stall] mark failed',
        row.executionKey,
        e instanceof Error ? e.message : e,
      );
      out.push(row);
    }
  }
  return out;
}
