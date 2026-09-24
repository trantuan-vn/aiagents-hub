/**
 * Phase B.1 — admin: workflow_execution ledger + service_usages fan-out by executionKey.
 */

export type ExecutionUsagesFilters = {
  executionKey?: string;
  userId?: string;
  workflowId?: number;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
};

export type ExecutionLedgerRow = {
  executionKey: string;
  workflowId: number;
  workflowName?: string;
  status: string;
  totalCreditsCharged?: number;
  totalCostVnd?: number;
  stepCount?: number;
  startedAt?: number;
  finishedAt?: number;
  user_id?: string;
};

export type UsageFanoutRow = {
  id?: number;
  globalId?: number;
  serviceId: number;
  endpoint: string;
  creditsCharged?: number;
  cost?: number;
  isError?: boolean | number;
  modelId?: string;
  created_at?: number;
  executionKey?: string;
};

export type ExecutionUsagesReport = {
  execution: ExecutionLedgerRow | null;
  usageCount: number;
  usageCredits: number;
  usageErrors: number;
  usages: UsageFanoutRow[];
  hasMore: boolean;
  recentExecutions: ExecutionLedgerRow[];
};

export async function getExecutionUsagesReport(
  db: D1Database,
  filters: ExecutionUsagesFilters,
): Promise<ExecutionUsagesReport> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const key = filters.executionKey?.trim();

  let execution: ExecutionLedgerRow | null = null;
  if (key) {
    execution =
      (await db
        .prepare(`SELECT * FROM workflow_executions WHERE executionKey = ? LIMIT 1`)
        .bind(key)
        .first<ExecutionLedgerRow>()) ?? null;
  }

  const usageConditions: string[] = [];
  const usageParams: (string | number)[] = [];
  if (key) {
    usageConditions.push('"executionKey" = ?');
    usageParams.push(key);
  } else {
    // Without a key, only list recent executions (no unbounded usages scan).
    return {
      execution: null,
      usageCount: 0,
      usageCredits: 0,
      usageErrors: 0,
      usages: [],
      hasMore: false,
      recentExecutions: await listRecentExecutions(db, filters, 25),
    };
  }

  const where = usageConditions.join(' AND ');
  const agg = await db
    .prepare(
      `SELECT
        COUNT(*) as cnt,
        SUM(COALESCE(creditsCharged, 0)) as credits,
        SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as errors
      FROM service_usages WHERE ${where}`,
    )
    .bind(...usageParams)
    .first<{ cnt: number; credits: number; errors: number }>();

  const listSql = `SELECT * FROM service_usages WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const list = await db
    .prepare(listSql)
    .bind(...usageParams, limit + 1, offset)
    .all<UsageFanoutRow>();
  const rows = list.results ?? [];
  const hasMore = rows.length > limit;

  return {
    execution,
    usageCount: Number(agg?.cnt ?? 0) || 0,
    usageCredits: Number(agg?.credits ?? 0) || 0,
    usageErrors: Number(agg?.errors ?? 0) || 0,
    usages: rows.slice(0, limit),
    hasMore,
    recentExecutions: await listRecentExecutions(db, filters, 25),
  };
}

async function listRecentExecutions(
  db: D1Database,
  filters: ExecutionUsagesFilters,
  limit: number,
): Promise<ExecutionLedgerRow[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filters.userId) {
    conditions.push('"user_id" = ?');
    params.push(filters.userId);
  }
  if (filters.workflowId != null) {
    conditions.push('"workflowId" = ?');
    params.push(filters.workflowId);
  }
  if (filters.dateFrom != null) {
    conditions.push('"startedAt" >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo != null) {
    conditions.push('"startedAt" <= ?');
    params.push(filters.dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db
    .prepare(
      `SELECT executionKey, workflowId, workflowName, status, totalCreditsCharged, totalCostVnd,
              stepCount, startedAt, finishedAt, user_id
       FROM workflow_executions ${where}
       ORDER BY startedAt DESC LIMIT ?`,
    )
    .bind(...params, limit)
    .all<ExecutionLedgerRow>();
  return result.results ?? [];
}
