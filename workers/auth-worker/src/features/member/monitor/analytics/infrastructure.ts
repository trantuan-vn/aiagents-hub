/**
 * Fetches aggregated service_usages analytics from D1.
 * Groups by date for charts and summary tables.
 * Cost is always returned in Credits (CR): recorded creditsCharged, else USD cost converted.
 */

import { DEFAULT_CREDIT_PRICE_USD, usdToCredits } from "../../../admin/service/credit";

export type AnalyticsDuration = "week" | "month" | "quarter" | "year";

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  requestCount: number;
  successCount: number;
  errorCount: number;
  /** Usage charged in Credits (CR). */
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
 * Prefer recorded Credits; convert leftover USD `cost` (legacy rows) at the current credit price.
 */
export function usageRowsToCredits(
  creditsCharged: number,
  usdCostLegacy: number,
  creditPriceUsd = DEFAULT_CREDIT_PRICE_USD,
): number {
  return (Number(creditsCharged) || 0) + usdToCredits(Number(usdCostLegacy) || 0, creditPriceUsd);
}

/**
 * D1/SQLite: created_at is stored as millisecond timestamp.
 * date(created_at/1000, 'unixepoch') returns 'YYYY-MM-DD'.
 */
export async function getServiceUsageAnalytics(
  db: D1Database,
  userId: string,
  duration: AnalyticsDuration,
  creditPriceUsd = DEFAULT_CREDIT_PRICE_USD,
): Promise<AnalyticsResult> {
  const { from, to } = getDateRange(duration);

  type Row = {
    date: string;
    request_count: number;
    success_count: number;
    error_count: number;
    day_credits: number;
    day_usd: number;
  };

  const sqlWithCredits = `
    SELECT
      date(created_at/1000, 'unixepoch') as date,
      COUNT(*) as request_count,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN COALESCE(creditsCharged, 0) ELSE 0 END) as day_credits,
      SUM(CASE WHEN (isError = 0 OR isError IS NULL) AND COALESCE(creditsCharged, 0) = 0 THEN COALESCE("cost", 0) ELSE 0 END) as day_usd
    FROM service_usages
    WHERE user_id = ? AND created_at >= ? AND created_at <= ?
    GROUP BY date
    ORDER BY date ASC
  `;
  const sqlUsdOnly = `
    SELECT
      date(created_at/1000, 'unixepoch') as date,
      COUNT(*) as request_count,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as error_count,
      0 as day_credits,
      SUM(CASE WHEN isError = 0 OR isError IS NULL THEN COALESCE("cost", 0) ELSE 0 END) as day_usd
    FROM service_usages
    WHERE user_id = ? AND created_at >= ? AND created_at <= ?
    GROUP BY date
    ORDER BY date ASC
  `;

  let rows: Row[] = [];
  try {
    const result = await db.prepare(sqlWithCredits).bind(userId, from, to).all<Row>();
    rows = result.results ?? [];
  } catch {
    const result = await db.prepare(sqlUsdOnly).bind(userId, from, to).all<Row>();
    rows = result.results ?? [];
  }
  const daily: DailyUsage[] = rows.map((r) => ({
    date: r.date,
    requestCount: r.request_count ?? 0,
    successCount: r.success_count ?? 0,
    errorCount: r.error_count ?? 0,
    cost: usageRowsToCredits(r.day_credits, r.day_usd, creditPriceUsd),
  }));

  const totalRequests = daily.reduce((sum, d) => sum + d.requestCount, 0);
  const totalCost = daily.reduce((sum, d) => sum + d.cost, 0);

  return {
    daily,
    totalRequests,
    totalCost,
  };
}
