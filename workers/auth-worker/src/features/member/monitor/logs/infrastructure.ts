/**
 * Fetches service_usages from D1 database.
 * Data is synced from UserDO to D1 via queue-worker; D1 holds the consolidated dataset.
 */

export interface LogsFilters {
  limit?: number;
  offset?: number;
  serviceId?: number;
  endpoint?: string;
  dateFrom?: number;
  dateTo?: number;
}

export interface ServiceUsageLog {
  id?: number;
  globalId?: number;
  serviceId: number;
  endpoint: string;
  userAgent?: string;
  ipAddress?: string;
  user_id?: string;
  isError?: boolean | number;
  created_at?: number;
  updated_at?: number;
}

export interface ErrorRateStats {
  total: number;
  errors: number;
  errorRatePercent: number;
}

export interface LogsResult {
  logs: ServiceUsageLog[];
  hasMore: boolean;
  errorRate?: ErrorRateStats;
}

export async function getServiceUsageLogs(
  db: D1Database,
  userId: string,
  filters: LogsFilters
): Promise<LogsResult> {
  const { limit = 50, offset = 0, serviceId, endpoint, dateFrom, dateTo } = filters;

  const conditions: string[] = ['"user_id" = ?'];
  const params: (string | number)[] = [userId];

  if (serviceId != null) {
    conditions.push('"serviceId" = ?');
    params.push(serviceId);
  }
  if (endpoint && endpoint.trim()) {
    conditions.push('"endpoint" LIKE ?');
    params.push(`%${endpoint.trim()}%`);
  }
  if (dateFrom != null) {
    conditions.push('"created_at" >= ?');
    params.push(dateFrom);
  }
  if (dateTo != null) {
    conditions.push('"created_at" <= ?');
    params.push(dateTo);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `SELECT * FROM service_usages WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);

  const result = await db.prepare(sql).bind(...params).all<ServiceUsageLog>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const logs = rows.slice(0, limit);

  const errorRate = await getErrorRateStats(db, userId, { serviceId, endpoint, dateFrom, dateTo });

  return { logs, hasMore, errorRate };
}

export async function getErrorRateStats(
  db: D1Database,
  userId: string,
  filters: Pick<LogsFilters, 'serviceId' | 'endpoint' | 'dateFrom' | 'dateTo'>
): Promise<ErrorRateStats> {
  const conditions: string[] = ['"user_id" = ?'];
  const params: (string | number)[] = [userId];

  if (filters.serviceId != null) {
    conditions.push('"serviceId" = ?');
    params.push(filters.serviceId);
  }
  if (filters.endpoint && filters.endpoint.trim()) {
    conditions.push('"endpoint" LIKE ?');
    params.push(`%${filters.endpoint.trim()}%`);
  }
  if (filters.dateFrom != null) {
    conditions.push('"created_at" >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo != null) {
    conditions.push('"created_at" <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN isError = 1 THEN 1 ELSE 0 END) as errors
  FROM service_usages WHERE ${whereClause}`;

  const row = await db.prepare(sql).bind(...params).first<{ total: number; errors: number }>();
  const total = row?.total ?? 0;
  const errors = row?.errors ?? 0;
  const errorRatePercent = total > 0 ? Math.round((errors / total) * 100 * 10) / 10 : 0;

  return { total, errors, errorRatePercent };
}
