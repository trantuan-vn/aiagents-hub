/**
 * Fetches order history from D1 database.
 * Data is synced from UserDO to D1 via queue-worker; D1 holds the consolidated dataset.
 */

export interface OrderHistoryFilters {
  limit?: number;
  offset?: number;
  fromDate?: string; // ISO date YYYY-MM-DD
  toDate?: string; // ISO date YYYY-MM-DD
}

export interface OrderHistoryRow {
  id: number;
  orderCode: string;
  subtotalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: string;
  currency: string;
  appliedVoucherCode?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  created_at?: number;
  updated_at?: number;
}

export interface OrderHistoryItem {
  id: number;
  orderCode: string;
  subtotalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: string;
  currency: string;
  appliedVoucherCode?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderHistoryResult {
  orders: OrderHistoryItem[];
  hasMore: boolean;
}

function toOrderHistoryItem(row: OrderHistoryRow): OrderHistoryItem {
  const createdAt = row.created_at
    ? new Date(row.created_at).toISOString()
    : new Date().toISOString();
  const updatedAt = row.updated_at
    ? new Date(row.updated_at).toISOString()
    : createdAt;
  return {
    id: row.id,
    orderCode: row.orderCode,
    subtotalAmount: row.subtotalAmount,
    discountAmount: row.discountAmount ?? 0,
    finalAmount: row.finalAmount,
    status: row.status,
    currency: row.currency ?? "VND",
    appliedVoucherCode: row.appliedVoucherCode ?? null,
    notes: row.notes ?? null,
    internalNotes: row.internalNotes ?? null,
    createdAt,
    updatedAt,
  };
}

export async function getOrderHistoryFromD1(
  db: D1Database,
  userId: string,
  filters: OrderHistoryFilters
): Promise<OrderHistoryResult> {
  const { limit = 50, offset = 0, fromDate, toDate } = filters;

  const conditions: string[] = ['"user_id" = ?'];
  const bindValues: (string | number)[] = [userId];

  if (fromDate) {
    const fromTs = new Date(fromDate + "T00:00:00.000Z").getTime();
    conditions.push('"created_at" >= ?');
    bindValues.push(fromTs);
  }
  if (toDate) {
    const toTs = new Date(toDate + "T23:59:59.999Z").getTime();
    conditions.push('"created_at" <= ?');
    bindValues.push(toTs);
  }

  const whereClause = conditions.join(" AND ");
  const sql = `
    SELECT id, "orderCode", "subtotalAmount", "discountAmount", "finalAmount",
           status, currency, "appliedVoucherCode", notes, "internalNotes",
           "created_at", "updated_at"
    FROM orders
    WHERE ${whereClause}
    ORDER BY "created_at" DESC
    LIMIT ? OFFSET ?
  `;

  bindValues.push(limit + 1, offset);
  const result = await db
    .prepare(sql)
    .bind(...bindValues)
    .all<OrderHistoryRow>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const orders = rows.slice(0, limit).map(toOrderHistoryItem);

  return { orders, hasMore };
}
