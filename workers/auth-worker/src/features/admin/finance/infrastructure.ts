import { roundVndAmount } from '../service/pricing';

/**
 * Fetches admin Finance stats from D1 - revenue, orders, commissions, cash flow.
 * Supports modern financial management and business decision making.
 */

export interface AdminFinanceStats {
  /** Overview KPIs */
  totalRevenue: { current: number; previous: number; changePercent: number };
  totalOrders: { current: number; previous: number; changePercent: number };
  completedOrders: { current: number; previous: number; changePercent: number };
  commissionPaid: { current: number; previous: number; changePercent: number };
  totalDiscounts: { current: number; previous: number; changePercent: number };
  netRevenue: { current: number; previous: number; changePercent: number };
  averageOrderValue: { current: number; previous: number; changePercent: number };

  /** Order status breakdown (this month) */
  ordersByStatus: { status: string; count: number; amount: number; fill: string }[];

  /** Revenue trend by month */
  revenueByMonth: { month: string; revenue: number; orders: number; commission: number; discount: number }[];

  /** Daily revenue/cash flow (last 30 days) */
  revenueByDay: { date: string; revenue: number; orders: number }[];

  /** Recent orders for table */
  recentOrders: {
    id: string;
    orderCode: string;
    finalAmount: number;
    status: string;
    createdAt: string;
    userId?: string;
  }[];
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

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  try {
    const result = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .first<{ name: string }>();
    return !!result?.name;
  } catch {
    return false;
  }
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

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'var(--chart-1)',
  PENDING: 'var(--chart-2)',
  CANCELLED: 'var(--chart-3)',
  CONFIRMED: 'var(--chart-4)',
  PROCESSING: 'var(--chart-5)',
};

export async function getAdminFinanceStats(db: D1Database): Promise<AdminFinanceStats> {
  const curr = getMonthBounds(0);
  const prev = getMonthBounds(-1);
  const last30Days = getDayBounds(30);

  const hasOrdersTable = await tableExists(db, 'orders');
  const hasCommissionsTable = await tableExists(db, 'commissions');
  const hasDiscountAmount = hasOrdersTable ? await hasColumn(db, 'orders', 'discountAmount') : false;

  if (!hasOrdersTable) {
    return getEmptyStats();
  }

  const [
    revenueCurr,
    revenuePrev,
    ordersCurr,
    ordersPrev,
    completedCurr,
    completedPrev,
    commissionCurr,
    commissionPrev,
    discountCurr,
    discountPrev,
    revenueByMonthRows,
    revenueByDayRows,
    ordersByStatusRows,
    recentOrdersRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
      )
      .bind(curr.start, curr.end)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM("finalAmount"), 0) as total FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
      )
      .bind(prev.start, prev.end)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ?`
      )
      .bind(curr.start, curr.end)
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ?`
      )
      .bind(prev.start, prev.end)
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
      )
      .bind(curr.start, curr.end)
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM orders 
         WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
      )
      .bind(prev.start, prev.end)
      .first<{ cnt: number }>(),
    hasCommissionsTable
      ? db
          .prepare(
            `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions 
             WHERE "created_at" >= ? AND "created_at" <= ?`
          )
          .bind(curr.start, curr.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    hasCommissionsTable
      ? db
          .prepare(
            `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions 
             WHERE "created_at" >= ? AND "created_at" <= ?`
          )
          .bind(prev.start, prev.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    hasDiscountAmount
      ? db
          .prepare(
            `SELECT COALESCE(SUM("discountAmount"), 0) as total FROM orders 
             WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
          )
          .bind(curr.start, curr.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    hasDiscountAmount
      ? db
          .prepare(
            `SELECT COALESCE(SUM("discountAmount"), 0) as total FROM orders 
             WHERE "created_at" >= ? AND "created_at" <= ? AND status = 'COMPLETED'`
          )
          .bind(prev.start, prev.end)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
    db
      .prepare(
        `SELECT strftime('%Y-%m', datetime(created_at/1000, 'unixepoch')) as month,
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN "finalAmount" ELSE 0 END), 0) as revenue,
                COUNT(*) as orders,
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) as completed
         FROM orders WHERE "created_at" >= ?
         GROUP BY month ORDER BY month DESC LIMIT 12`
      )
      .bind(prev.start)
      .all<{ month: string; revenue: number; orders: number; completed: number }>(),
    db
      .prepare(
        `SELECT date(created_at/1000, 'unixepoch') as date,
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN "finalAmount" ELSE 0 END), 0) as revenue,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as orders
         FROM orders WHERE "created_at" >= ? AND "created_at" <= ?
         GROUP BY date ORDER BY date ASC`
      )
      .bind(last30Days.start, last30Days.end)
      .all<{ date: string; revenue: number; orders: number }>(),
    db
      .prepare(
        `SELECT status, COUNT(*) as count, COALESCE(SUM("finalAmount"), 0) as amount
         FROM orders WHERE "created_at" >= ? AND "created_at" <= ?
         GROUP BY status`
      )
      .bind(curr.start, curr.end)
      .all<{ status: string; count: number; amount: number }>(),
    db
      .prepare(
        `SELECT id, "orderCode", "finalAmount", status, "created_at", "user_id" as userId
         FROM orders ORDER BY "created_at" DESC LIMIT 15`
      )
      .all<{ id: number; orderCode: string; finalAmount: number; status: string; created_at: number; userId?: string }>(),
  ]);

  const rCurr = revenueCurr?.total ?? 0;
  const rPrev = revenuePrev?.total ?? 0;
  const revChange = rPrev > 0 ? ((rCurr - rPrev) / rPrev) * 100 : rCurr > 0 ? 100 : 0;

  const oCurr = ordersCurr?.cnt ?? 0;
  const oPrev = ordersPrev?.cnt ?? 0;
  const orderChange = oPrev > 0 ? ((oCurr - oPrev) / oPrev) * 100 : oCurr > 0 ? 100 : 0;

  const cCurr = completedCurr?.cnt ?? 0;
  const cPrev = completedPrev?.cnt ?? 0;
  const completedChange = cPrev > 0 ? ((cCurr - cPrev) / cPrev) * 100 : cCurr > 0 ? 100 : 0;

  const commCurr = commissionCurr?.total ?? 0;
  const commPrev = commissionPrev?.total ?? 0;
  const commChange = commPrev > 0 ? ((commCurr - commPrev) / commPrev) * 100 : commCurr > 0 ? 100 : 0;

  const dCurr = discountCurr?.total ?? 0;
  const dPrev = discountPrev?.total ?? 0;
  const discChange = dPrev > 0 ? ((dCurr - dPrev) / dPrev) * 100 : dCurr > 0 ? 100 : 0;

  const netCurr = rCurr - commCurr;
  const netPrev = rPrev - commPrev;
  const netChange = netPrev > 0 ? ((netCurr - netPrev) / netPrev) * 100 : netCurr > 0 ? 100 : 0;

  const aovCurr = cCurr > 0 ? rCurr / cCurr : 0;
  const aovPrev = cPrev > 0 ? rPrev / cPrev : 0;
  const aovChange = aovPrev > 0 ? ((aovCurr - aovPrev) / aovPrev) * 100 : aovCurr > 0 ? 100 : 0;

  const ordersByStatus = (ordersByStatusRows?.results ?? []).map((r) => ({
    status: r.status,
    count: r.count,
    amount: r.amount,
    fill: STATUS_COLORS[r.status] ?? 'var(--chart-1)',
  }));

  const revenueByMonth = (revenueByMonthRows?.results ?? []).reverse().map((r) => ({
    month: r.month,
    revenue: r.revenue,
    orders: r.completed,
    commission: 0,
    discount: 0,
  }));

  const revenueByDay = (revenueByDayRows?.results ?? []).map((r) => ({
    date: r.date,
    revenue: r.revenue,
    orders: r.orders,
  }));

  const recentOrders = (recentOrdersRows?.results ?? []).map((r) => ({
    id: String(r.id),
    orderCode: r.orderCode,
    finalAmount: r.finalAmount,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString().slice(0, 10),
    userId: r.userId,
  }));

  return {
    totalRevenue: { current: rCurr, previous: rPrev, changePercent: revChange },
    totalOrders: { current: oCurr, previous: oPrev, changePercent: orderChange },
    completedOrders: { current: cCurr, previous: cPrev, changePercent: completedChange },
    commissionPaid: { current: commCurr, previous: commPrev, changePercent: commChange },
    totalDiscounts: { current: dCurr, previous: dPrev, changePercent: discChange },
    netRevenue: { current: netCurr, previous: netPrev, changePercent: netChange },
    averageOrderValue: { current: roundVndAmount(aovCurr), previous: roundVndAmount(aovPrev), changePercent: aovChange },
    ordersByStatus,
    revenueByMonth,
    revenueByDay,
    recentOrders,
  };
}

function getEmptyStats(): AdminFinanceStats {
  return {
    totalRevenue: { current: 0, previous: 0, changePercent: 0 },
    totalOrders: { current: 0, previous: 0, changePercent: 0 },
    completedOrders: { current: 0, previous: 0, changePercent: 0 },
    commissionPaid: { current: 0, previous: 0, changePercent: 0 },
    totalDiscounts: { current: 0, previous: 0, changePercent: 0 },
    netRevenue: { current: 0, previous: 0, changePercent: 0 },
    averageOrderValue: { current: 0, previous: 0, changePercent: 0 },
    ordersByStatus: [],
    revenueByMonth: [],
    revenueByDay: [],
    recentOrders: [],
  };
}
