/**
 * Fetches admin dashboard stats from D1 (aggregated across all users).
 */

export interface AdminDefaultStats {
  totalRevenue: { current: number; previous: number; changePercent: number };
  newCustomers: { current: number; previous: number; changePercent: number };
  activeAccounts: { current: number; previous: number; changePercent: number };
  apiErrorRate: { current: number; previous: number; changePercent: number };
  visitorsByDate: { date: string; count: number }[];
  visitorsByCountry: { country: string; count: number }[];
}

function getMonthBounds(offset: number): { start: number; end: number } {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  d.setMonth(d.getMonth() + 1);
  const end = d.getTime() - 1;
  return { start, end };
}

export async function getAdminDefaultStats(db: D1Database): Promise<AdminDefaultStats> {
  const curr = getMonthBounds(0);
  const prev = getMonthBounds(-1);

  const [
    revenueCurr,
    revenuePrev,
    customersCurr,
    customersPrev,
    activeCurr,
    activePrev,
    errorCurr,
    errorPrev,
    visitorsByDate,
    visitorsByCountry,
  ] = await Promise.all([
    db.prepare(
      `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
    )
      .bind(curr.start, curr.end)
      .first<{ total: number }>(),
    db.prepare(
      `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
    )
      .bind(prev.start, prev.end)
      .first<{ total: number }>(),
    db.prepare(
      `SELECT COUNT(DISTINCT "user_id") as cnt FROM users WHERE "created_at" >= ? AND "created_at" <= ?`
    )
      .bind(curr.start, curr.end)
      .first<{ cnt: number }>(),
    db.prepare(
      `SELECT COUNT(DISTINCT "user_id") as cnt FROM users WHERE "created_at" >= ? AND "created_at" <= ?`
    )
      .bind(prev.start, prev.end)
      .first<{ cnt: number }>(),
    db.prepare(
      `SELECT COUNT(DISTINCT "user_id") as cnt FROM service_usages WHERE "created_at" >= ? AND "created_at" <= ? AND (isError = 0 OR isError IS NULL)`
    )
      .bind(curr.start, curr.end)
      .first<{ cnt: number }>(),
    db.prepare(
      `SELECT COUNT(DISTINCT "user_id") as cnt FROM service_usages WHERE "created_at" >= ? AND "created_at" <= ? AND (isError = 0 OR isError IS NULL)`
    )
      .bind(prev.start, prev.end)
      .first<{ cnt: number }>(),
    db.prepare(
      `SELECT 
        SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as errors,
        COUNT(*) as total
       FROM service_usages WHERE "created_at" >= ? AND "created_at" <= ?`
    )
      .bind(curr.start, curr.end)
      .first<{ errors: number; total: number }>(),
    db.prepare(
      `SELECT 
        SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as errors,
        COUNT(*) as total
       FROM service_usages WHERE "created_at" >= ? AND "created_at" <= ?`
    )
      .bind(prev.start, prev.end)
      .first<{ errors: number; total: number }>(),
    db.prepare(
      `SELECT date(created_at/1000, 'unixepoch') as date, COUNT(*) as count
       FROM sessions WHERE created_at >= ? AND created_at <= ?
       GROUP BY date ORDER BY date ASC`
    )
      .bind(prev.start, curr.end)
      .all<{ date: string; count: number }>(),
    db.prepare(
      `SELECT COALESCE(country, 'XX') as country, COUNT(*) as count
       FROM sessions WHERE created_at >= ? AND created_at <= ?
       GROUP BY country ORDER BY count DESC`
    )
      .bind(curr.start, curr.end)
      .all<{ country: string; count: number }>(),
  ]);

  const rCurr = revenueCurr?.total ?? 0;
  const rPrev = revenuePrev?.total ?? 0;
  const revChange = rPrev > 0 ? ((rCurr - rPrev) / rPrev) * 100 : (rCurr > 0 ? 100 : 0);

  const cCurr = customersCurr?.cnt ?? 0;
  const cPrev = customersPrev?.cnt ?? 0;
  const custChange = cPrev > 0 ? ((cCurr - cPrev) / cPrev) * 100 : (cCurr > 0 ? 100 : 0);

  const aCurr = activeCurr?.cnt ?? 0;
  const aPrev = activePrev?.cnt ?? 0;
  const activeChange = aPrev > 0 ? ((aCurr - aPrev) / aPrev) * 100 : (aCurr > 0 ? 100 : 0);

  const errCurrTotal = errorCurr?.total ?? 0;
  const errCurrCount = errorCurr?.errors ?? 0;
  const errCurrRate = errCurrTotal > 0 ? (errCurrCount / errCurrTotal) * 100 : 0;
  const errPrevTotal = errorPrev?.total ?? 0;
  const errPrevCount = errorPrev?.errors ?? 0;
  const errPrevRate = errPrevTotal > 0 ? (errPrevCount / errPrevTotal) * 100 : 0;
  const errChange = errPrevRate > 0 ? ((errCurrRate - errPrevRate) / errPrevRate) * 100 : (errCurrRate > 0 ? 100 : 0);

  const visitorsRows = visitorsByDate?.results ?? [];
  const countryRows = visitorsByCountry?.results ?? [];

  return {
    totalRevenue: { current: rCurr, previous: rPrev, changePercent: revChange },
    newCustomers: { current: cCurr, previous: cPrev, changePercent: custChange },
    activeAccounts: { current: aCurr, previous: aPrev, changePercent: activeChange },
    apiErrorRate: { current: errCurrRate, previous: errPrevRate, changePercent: errChange },
    visitorsByDate: visitorsRows.map((r) => ({ date: r.date, count: r.count })),
    visitorsByCountry: countryRows.map((r) => ({ country: r.country, count: r.count })),
  };
}
