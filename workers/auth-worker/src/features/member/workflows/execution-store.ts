import { executeUtils } from '../../../shared/utils.js';
import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import type { WorkflowExecution, WorkflowExecutionStatus } from './domain.js';

/**
 * Persistence helpers for durable workflow executions. Records live in the
 * consumer's UserDO (the user who runs the workflow), so they are scoped to the
 * caller and survive across requests for resume / history.
 */

export type ExecutionRow = WorkflowExecution & { id: number };

export interface CreateExecutionInput {
  executionKey: string;
  workflowId: number;
  workflowOwnerId: string;
  workflowName?: string;
  input?: string;
  state: string;
}

export async function createExecution(
  userDO: DurableObjectStub<UserDO>,
  data: CreateExecutionInput,
): Promise<ExecutionRow> {
  const created = await executeUtils.executeDynamicAction(
    userDO,
    'insert',
    {
      status: 'running',
      totalCostVnd: 0,
      stepCount: 0,
      startedAt: Date.now(),
      ...data,
    },
    'workflow_executions',
  );
  return created as ExecutionRow;
}

export interface UpdateExecutionPatch {
  status?: WorkflowExecutionStatus;
  output?: string;
  error?: string;
  totalCostVnd?: number;
  stepCount?: number;
  state?: string;
  /** Empty string clears the pending node (schema rejects null). */
  pendingNodeId?: string;
  finishedAt?: number;
}

export async function updateExecution(
  userDO: DurableObjectStub<UserDO>,
  id: number,
  patch: UpdateExecutionPatch,
): Promise<void> {
  await executeUtils.executeDynamicAction(
    userDO,
    'update',
    { id, ...patch },
    'workflow_executions',
  );
}

export async function getExecutionByKey(
  userDO: DurableObjectStub<UserDO>,
  executionKey: string,
): Promise<ExecutionRow | null> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    { where: { field: 'executionKey', operator: '=', value: executionKey } },
    'workflow_executions',
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return (row as ExecutionRow) ?? null;
}

export async function listExecutions(
  userDO: DurableObjectStub<UserDO>,
  workflowId: number,
  limit = 50,
): Promise<ExecutionRow[]> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    {
      where: { field: 'workflowId', operator: '=', value: workflowId },
      orderBy: { field: 'startedAt', direction: 'DESC' },
      limit,
    },
    'workflow_executions',
  );
  return Array.isArray(rows) ? (rows as ExecutionRow[]) : [];
}
