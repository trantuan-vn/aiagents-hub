/**
 * Fetches aggregated service_usages analytics from D1.
 * Groups by date for charts and summary tables.
 */

export type AnalyticsDuration = "week" | "month" | "quarter" | "year";

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  requestCount: number;
  successCount: number;
  errorCount: number;
  cost: number;
}

export interface AnalyticsResult {
  daily: DailyUsage[];
  totalRequests: number;
  totalCost: number;
}

function getDateRange(duration: AnalyticsDuration): { from: number; to: number } {
  const now = Date.now();
  const to = now;
  let from: number;

  switch (duration) {
    case "week":
      from = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      from = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case "quarter":
      from = now - 90 * 24 * 60 * 60 * 1000;
      break;
    case "year":
      from = now - 365 * 24 * 60 * 60 * 1000;
      break;
    default:
      from = now - 30 * 24 * 60 * 60 * 1000;
  }

  return { from, to };
}

/**
 * D1/SQLite: created_at is stored as millisecond timestamp.
 * date(created_at/1000, 'unixepoch') returns 'YYYY-MM-DD'.
 */
export async function getServiceUsageAnalytics(
  db: D1Database,
  userId: string,
  duration: AnalyticsDuration
): Promise<AnalyticsResult> {
  const { from, to } = getDateRange(duration);

  const sql = `
    SELECT 
      date(created_at/1000, 'unixepoch') as date,
      COUNT(*) as request_count,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN COALESCE("cost", 0) ELSE 0 END) as day_cost
    FROM service_usages 
    WHERE user_id = ? AND created_at >= ? AND created_at <= ?
    GROUP BY date
    ORDER BY date ASC
  `;

  const result = await db.prepare(sql).bind(userId, from, to).all<{
    date: string;
    request_count: number;
    success_count: number;
    error_count: number;
    day_cost: number;
  }>();

  const rows = result.results ?? [];
  const daily: DailyUsage[] = rows.map((r) => ({
    date: r.date,
    requestCount: r.request_count ?? 0,
    successCount: r.success_count ?? 0,
    errorCount: r.error_count ?? 0,
    cost: Number(r.day_cost) || 0,
  }));

  const totalRequests = daily.reduce((sum, d) => sum + d.requestCount, 0);
  const totalCost = daily.reduce((sum, d) => sum + d.cost, 0);

  return {
    daily,
    totalRequests,
    totalCost,
  };
}
