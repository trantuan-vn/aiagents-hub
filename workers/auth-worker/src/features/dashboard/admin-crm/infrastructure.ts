/**
 * Fetches admin CRM stats from D1 - users, referral success, orders.
 * Supports modern customer management and business decision making.
 */

export interface AdminCrmStats {
  /** Overview KPIs */
  totalUsers: { current: number; previous: number; changePercent: number };
  referredUsers: { current: number; previous: number; changePercent: number };
  directUsers: { current: number; previous: number; changePercent: number };
  totalRevenue: { current: number; previous: number; changePercent: number };
  commissionPaid: { current: number; previous: number; changePercent: number };

  /** Users by source (referral vs direct) */
  usersBySource: { source: string; count: number; fill: string }[];

  /** New users trend by date (last 30 days) */
  newUsersByDate: { date: string; total: number; referred: number; direct: number }[];

  /** Revenue trend by month */
  revenueByMonth: { month: string; revenue: number; orders: number }[];

  /** Top referrers (by commission or referred count) */
  topReferrers: { referrerId: string; referredCount: number; commissionAmount: number }[];

  /** Recent referred users for table */
  recentReferredUsers: {
    id: string;
    identifier: string;
    referrerId: string;
    createdAt: string;
  }[];

  /** Visitors by country (from sessions) */
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

function getDayBounds(daysBack: number): { start: number; end: number } {
  const end = Date.now();
  const start = end - daysBack * 24 * 60 * 60 * 1000;
  return { start, end };
}

export async function getAdminCrmStats(db: D1Database): Promise<AdminCrmStats> {
  const curr = getMonthBounds(0);
  const prev = getMonthBounds(-1);
  const last30Days = getDayBounds(30);

  // Safely run query - return default if column doesn't exist (older D1 schema)
  const hasReferrerId = await hasColumn(db, 'users', 'referrerId');
  const hasCommissionsTable = await tableExists(db, 'commissions');

  const [
    totalUsersCurr,
    totalUsersPrev,
    referredUsersCurr,
    referredUsersPrev,
    revenueCurr,
    revenuePrev,
    commissionCurr,
    commissionPrev,
    newUsersByDateRows,
    revenueByMonthRows,
    topReferrersRows,
    recentReferredRows,
    visitorsByCountryRows,
  ] = await Promise.all([
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
    hasReferrerId
      ? db.prepare(
          `SELECT COUNT(DISTINCT "user_id") as cnt FROM users 
           WHERE "created_at" >= ? AND "created_at" <= ? AND "referrerId" IS NOT NULL AND "referrerId" != ''`
        )
          .bind(curr.start, curr.end)
          .first<{ cnt: number }>()
      : Promise.resolve({ cnt: 0 }),
    hasReferrerId
      ? db.prepare(
          `SELECT COUNT(DISTINCT "user_id") as cnt FROM users 
           WHERE "created_at" >= ? AND "created_at" <= ? AND "referrerId" IS NOT NULL AND "referrerId" != ''`
        )
          .bind(prev.start, prev.end)
          .first<{ cnt: number }>()
      : Promise.resolve({ cnt: 0 }),
    db.prepare(
      `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders 
       WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
    )
      .bind(curr.start, curr.end)
      .first<{ total: number }>(),
    db.prepare(
      `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders 
       WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
    )
      .bind(prev.start, prev.end)
      .first<{ total: number }>(),
    hasCommissionsTable
      ? db.prepare(
          `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions 
           WHERE "created_at" >= ? AND "created_at" <= ?`
        )
          .bind(curr.start, curr.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    hasCommissionsTable
      ? db.prepare(
          `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions 
           WHERE "created_at" >= ? AND "created_at" <= ?`
        )
          .bind(prev.start, prev.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    hasReferrerId
      ? db.prepare(
          `SELECT date(created_at/1000, 'unixepoch') as date,
                  COUNT(DISTINCT user_id) as total,
                  SUM(CASE WHEN "referrerId" IS NOT NULL AND "referrerId" != '' THEN 1 ELSE 0 END) as referred,
                  SUM(CASE WHEN "referrerId" IS NULL OR "referrerId" = '' THEN 1 ELSE 0 END) as direct
           FROM users WHERE "created_at" >= ? AND "created_at" <= ?
           GROUP BY date ORDER BY date ASC`
        )
          .bind(last30Days.start, last30Days.end)
          .all<{ date: string; total: number; referred: number; direct: number }>()
      : db.prepare(
          `SELECT date(created_at/1000, 'unixepoch') as date, COUNT(DISTINCT user_id) as total
           FROM users WHERE "created_at" >= ? AND "created_at" <= ?
           GROUP BY date ORDER BY date ASC`
        )
          .bind(last30Days.start, last30Days.end)
          .all<{ date: string; total: number }>(),
    db.prepare(
      `SELECT strftime('%Y-%m', datetime(created_at/1000, 'unixepoch')) as month,
              COALESCE(SUM("finalAmount"), 0) as revenue,
              COUNT(*) as orders
       FROM orders WHERE status = 'COMPLETED' AND "created_at" >= ?
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
      .bind(prev.start)
      .all<{ month: string; revenue: number; orders: number }>(),
    hasCommissionsTable
      ? db.prepare(
          `SELECT "user_id" as referrerId,
                  COUNT(DISTINCT "referredUserId") as referredCount,
                  COALESCE(SUM("commissionAmount"), 0) as commissionAmount
           FROM commissions WHERE "created_at" >= ?
           GROUP BY "user_id" ORDER BY commissionAmount DESC LIMIT 10`
        )
          .bind(last30Days.start)
          .all<{ referrerId: string; referredCount: number; commissionAmount: number }>()
      : Promise.resolve({ results: [] }),
    hasReferrerId
      ? db.prepare(
          `SELECT "user_id" as id, "user_id" as identifier, "referrerId" as referrerId, "created_at" as createdAt
           FROM users WHERE "referrerId" IS NOT NULL AND "referrerId" != ''
           ORDER BY "created_at" DESC LIMIT 20`
        )
          .all<{ id: string; identifier: string; referrerId: string; createdAt: number }>()
      : Promise.resolve({ results: [] }),
    db.prepare(
      `SELECT COALESCE(country, 'XX') as country, COUNT(*) as count
       FROM sessions WHERE created_at >= ? AND created_at <= ?
       GROUP BY country ORDER BY count DESC LIMIT 10`
    )
      .bind(curr.start, curr.end)
      .all<{ country: string; count: number }>(),
  ]);

  const totalCurr = totalUsersCurr?.cnt ?? 0;
  const totalPrev = totalUsersPrev?.cnt ?? 0;
  const totalChange = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : totalCurr > 0 ? 100 : 0;

  const referredCurr = referredUsersCurr?.cnt ?? 0;
  const referredPrev = referredUsersPrev?.cnt ?? 0;
  const referredChange = referredPrev > 0 ? ((referredCurr - referredPrev) / referredPrev) * 100 : referredCurr > 0 ? 100 : 0;

  const directCurr = totalCurr - referredCurr;
  const directPrev = totalPrev - referredPrev;
  const directChange = directPrev > 0 ? ((directCurr - directPrev) / directPrev) * 100 : directCurr > 0 ? 100 : 0;

  const rCurr = revenueCurr?.total ?? 0;
  const rPrev = revenuePrev?.total ?? 0;
  const revChange = rPrev > 0 ? ((rCurr - rPrev) / rPrev) * 100 : rCurr > 0 ? 100 : 0;

  const commCurr = commissionCurr?.total ?? 0;
  const commPrev = commissionPrev?.total ?? 0;
  const commChange = commPrev > 0 ? ((commCurr - commPrev) / commPrev) * 100 : commCurr > 0 ? 100 : 0;

  const newUsersByDate = (newUsersByDateRows?.results ?? []).map((r) =>
    'referred' in r && 'direct' in r
      ? { date: r.date, total: r.total, referred: r.referred, direct: r.direct }
      : { date: r.date, total: r.total, referred: 0, direct: r.total }
  );

  const revenueByMonth = (revenueByMonthRows?.results ?? []).reverse().map((r) => ({
    month: r.month,
    revenue: r.revenue,
    orders: r.orders,
  }));

  const topReferrers = (topReferrersRows?.results ?? []).map((r) => ({
    referrerId: r.referrerId,
    referredCount: r.referredCount,
    commissionAmount: r.commissionAmount,
  }));

  const recentReferredUsers = (recentReferredRows?.results ?? []).map((r) => ({
    id: r.id,
    identifier: r.identifier,
    referrerId: r.referrerId,
    createdAt: new Date(r.createdAt).toISOString().slice(0, 10),
  }));

  const visitorsByCountry = (visitorsByCountryRows?.results ?? []).map((r) => ({
    country: r.country,
    count: r.count,
  }));

  const usersBySource: { source: string; count: number; fill: string }[] = [
    { source: 'referral', count: referredCurr, fill: 'var(--chart-2)' },
    { source: 'direct', count: directCurr, fill: 'var(--chart-1)' },
  ].filter((x) => x.count > 0);

  if (usersBySource.length === 0) {
    usersBySource.push({ source: 'direct', count: totalCurr, fill: 'var(--chart-1)' });
  }

  return {
    totalUsers: { current: totalCurr, previous: totalPrev, changePercent: totalChange },
    referredUsers: { current: referredCurr, previous: referredPrev, changePercent: referredChange },
    directUsers: { current: directCurr, previous: directPrev, changePercent: directChange },
    totalRevenue: { current: rCurr, previous: rPrev, changePercent: revChange },
    commissionPaid: { current: commCurr, previous: commPrev, changePercent: commChange },
    usersBySource,
    newUsersByDate,
    revenueByMonth,
    topReferrers,
    recentReferredUsers,
    visitorsByCountry,
  };
}

async function hasColumn(db: D1Database, table: string, column: string): Promise<boolean> {
  try {
    const result = await db.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
    const columns = (result.results ?? []).map((r) => r.name);
    return columns.includes(column);
  } catch {
    return false;
  }
}

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  try {
    const result = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    )
      .bind(table)
      .first<{ name: string }>();
    return !!result?.name;
  } catch {
    return false;
  }
}
