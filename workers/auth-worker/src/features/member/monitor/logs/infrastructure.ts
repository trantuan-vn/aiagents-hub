/**
 * Phase B.1 — member Monitor Nhật ký reads execution ledger from D1 (not raw service_usages).
 */

export interface LogsFilters {
  limit?: number;
  offset?: number;
  workflowId?: number;
  status?: string;
  dateFrom?: number;
  dateTo?: number;
}

export interface ExecutionLogRow {
  id?: number;
  globalId?: number;
  executionKey: string;
  workflowId: number;
  workflowOwnerId?: string;
  workflowName?: string;
  status: string;
  totalCostVnd?: number;
  totalCreditsCharged?: number;
  totalCreditsRoyalty?: number;
  totalRoyaltyUsd?: number;
  stepCount?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  user_id?: string;
  created_at?: number;
  updated_at?: number;
}

export interface RunStats {
  total: number;
  failed: number;
  completed: number;
  failRatePercent: number;
  totalCredits: number;
}

export interface LogsResult {
  logs: ExecutionLogRow[];
  hasMore: boolean;
  runStats?: RunStats;
}

export async function getExecutionLogs(
  db: D1Database,
  userId: string,
  filters: LogsFilters,
): Promise<LogsResult> {
  const { limit = 50, offset = 0, workflowId, status, dateFrom, dateTo } = filters;

  const conditions: string[] = ['"user_id" = ?'];
  const params: (string | number)[] = [userId];

  if (workflowId != null) {
    conditions.push('"workflowId" = ?');
    params.push(workflowId);
  }
  if (status && status.trim()) {
    conditions.push('"status" = ?');
    params.push(status.trim());
  }
  if (dateFrom != null) {
    conditions.push('"startedAt" >= ?');
    params.push(dateFrom);
  }
  if (dateTo != null) {
    conditions.push('"startedAt" <= ?');
    params.push(dateTo);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `SELECT * FROM workflow_executions WHERE ${whereClause} ORDER BY startedAt DESC LIMIT ? OFFSET ?`;
  const queryParams = [...params, limit + 1, offset];

  const result = await db.prepare(sql).bind(...queryParams).all<ExecutionLogRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const logs = rows.slice(0, limit);
  const runStats = await getRunStats(db, userId, { workflowId, status, dateFrom, dateTo });

  return { logs, hasMore, runStats };
}

export async function getRunStats(
  db: D1Database,
  userId: string,
  filters: Pick<LogsFilters, 'workflowId' | 'status' | 'dateFrom' | 'dateTo'>,
): Promise<RunStats> {
  const conditions: string[] = ['"user_id" = ?'];
  const params: (string | number)[] = [userId];

  if (filters.workflowId != null) {
    conditions.push('"workflowId" = ?');
    params.push(filters.workflowId);
  }
  if (filters.status && filters.status.trim()) {
    conditions.push('"status" = ?');
    params.push(filters.status.trim());
  }
  if (filters.dateFrom != null) {
    conditions.push('"startedAt" >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo != null) {
    conditions.push('"startedAt" <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = conditions.join(' AND ');
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(COALESCE(totalCreditsCharged, totalCostVnd, 0)) as total_credits
      FROM workflow_executions WHERE ${whereClause}`,
    )
    .bind(...params)
    .first<{ total: number; failed: number; completed: number; total_credits: number }>();

  const total = Number(row?.total ?? 0) || 0;
  const failed = Number(row?.failed ?? 0) || 0;
  const completed = Number(row?.completed ?? 0) || 0;
  const totalCredits = Number(row?.total_credits ?? 0) || 0;
  return {
    total,
    failed,
    completed,
    failRatePercent: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
    totalCredits,
  };
}

/** @deprecated Use getExecutionLogs — kept for assistant tools during transition. */
export async function getServiceUsageLogs(
  db: D1Database,
  userId: string,
  filters: LogsFilters & { serviceId?: number; endpoint?: string },
): Promise<LogsResult> {
  return getExecutionLogs(db, userId, filters);
}

/** @deprecated */
export async function getErrorRateStats(
  db: D1Database,
  userId: string,
  filters: Pick<LogsFilters, 'workflowId' | 'status' | 'dateFrom' | 'dateTo'>,
): Promise<{ total: number; errors: number; errorRatePercent: number }> {
  const stats = await getRunStats(db, userId, filters);
  return { total: stats.total, errors: stats.failed, errorRatePercent: stats.failRatePercent };
}
