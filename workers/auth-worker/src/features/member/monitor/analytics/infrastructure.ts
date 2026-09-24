/**
 * Phase B.1 — member Monitor Phân tích aggregates workflow_executions ledger (not service_usages).
 */

export type AnalyticsDuration = 'week' | 'month' | 'quarter' | 'year';

export interface DailyUsage {
  date: string;
  /** Workflow runs that day. */
  requestCount: number;
  successCount: number;
  errorCount: number;
  /** Credits charged across runs. */
  cost: number;
}

export interface TopWorkflowRow {
  workflowId: number;
  workflowName: string;
  runs: number;
  credits: number;
}

export interface AnalyticsResult {
  daily: DailyUsage[];
  totalRequests: number;
  totalCost: number;
  topWorkflows: TopWorkflowRow[];
}

function getDateRange(duration: AnalyticsDuration): { from: number; to: number } {
  const now = Date.now();
  const to = now;
  let from: number;
  switch (duration) {
    case 'week':
      from = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case 'month':
      from = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case 'quarter':
      from = now - 90 * 24 * 60 * 60 * 1000;
      break;
    case 'year':
      from = now - 365 * 24 * 60 * 60 * 1000;
      break;
    default:
      from = now - 30 * 24 * 60 * 60 * 1000;
  }
  return { from, to };
}

export async function getExecutionAnalytics(
  db: D1Database,
  userId: string,
  duration: AnalyticsDuration,
): Promise<AnalyticsResult> {
  const { from, to } = getDateRange(duration);

  type DayRow = {
    date: string;
    request_count: number;
    success_count: number;
    error_count: number;
    day_credits: number;
  };

  const dailySql = `
    SELECT
      date(startedAt/1000, 'unixepoch') as date,
      COUNT(*) as request_count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_count,
      SUM(COALESCE(totalCreditsCharged, totalCostVnd, 0)) as day_credits
    FROM workflow_executions
    WHERE user_id = ? AND startedAt >= ? AND startedAt <= ?
    GROUP BY date
    ORDER BY date ASC
  `;

  const dailyResult = await db.prepare(dailySql).bind(userId, from, to).all<DayRow>();
  const daily: DailyUsage[] = (dailyResult.results ?? []).map((r) => ({
    date: r.date,
    requestCount: Number(r.request_count) || 0,
    successCount: Number(r.success_count) || 0,
    errorCount: Number(r.error_count) || 0,
    cost: Number(r.day_credits) || 0,
  }));

  const totalRequests = daily.reduce((s, d) => s + d.requestCount, 0);
  const totalCost = daily.reduce((s, d) => s + d.cost, 0);

  const topSql = `
    SELECT
      workflowId as workflowId,
      COALESCE(MAX(workflowName), '') as workflowName,
      COUNT(*) as runs,
      SUM(COALESCE(totalCreditsCharged, totalCostVnd, 0)) as credits
    FROM workflow_executions
    WHERE user_id = ? AND startedAt >= ? AND startedAt <= ?
    GROUP BY workflowId
    ORDER BY credits DESC
    LIMIT 10
  `;
  const topResult = await db
    .prepare(topSql)
    .bind(userId, from, to)
    .all<{ workflowId: number; workflowName: string; runs: number; credits: number }>();

  const topWorkflows: TopWorkflowRow[] = (topResult.results ?? []).map((r) => ({
    workflowId: Number(r.workflowId) || 0,
    workflowName: r.workflowName || `Workflow #${r.workflowId}`,
    runs: Number(r.runs) || 0,
    credits: Number(r.credits) || 0,
  }));

  return { daily, totalRequests, totalCost, topWorkflows };
}

/** @deprecated Use getExecutionAnalytics */
export async function getServiceUsageAnalytics(
  db: D1Database,
  userId: string,
  duration: AnalyticsDuration,
  _creditPriceUsd?: number,
): Promise<AnalyticsResult> {
  return getExecutionAnalytics(db, userId, duration);
}

export function usageRowsToCredits(
  creditsCharged: number,
  _usdCostLegacy: number,
  _creditPriceUsd?: number,
): number {
  return Number(creditsCharged) || 0;
}
