export interface SharedWorkflowFilters {
  limit?: number;
  offset?: number;
  starCount?: number;
  search?: string;
  excludeOwnerId?: string;
}

export interface SharedWorkflowRow {
  id?: number;
  globalId?: number;
  user_id?: string;
  name?: string;
  description?: string;
  slug?: string;
  isShared?: boolean | number;
  starCount?: number;
  starLabel?: string;
  usageCount?: number;
  totalEarningsVnd?: number;
  status?: string;
  created_at?: number;
}

export async function listSharedWorkflowsFromD1(
  db: D1Database,
  filters: SharedWorkflowFilters,
): Promise<{ workflows: SharedWorkflowRow[]; hasMore: boolean }> {
  const { limit = 50, offset = 0, starCount, search, excludeOwnerId } = filters;
  const conditions: string[] = ['"isShared" = 1', '"status" = ?'];
  const params: (string | number)[] = ['published'];

  if (excludeOwnerId) {
    conditions.push('"user_id" != ?');
    params.push(excludeOwnerId);
  }
  if (starCount != null && starCount >= 1 && starCount <= 5) {
    conditions.push('"starCount" = ?');
    params.push(starCount);
  }
  if (search?.trim()) {
    conditions.push('("name" LIKE ? OR "description" LIKE ?)');
    const q = `%${search.trim()}%`;
    params.push(q, q);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `SELECT id, globalId, user_id, name, description, slug, isShared, starCount, starLabel, usageCount, totalEarningsVnd, status, created_at
    FROM agent_workflows WHERE ${whereClause} ORDER BY usageCount DESC, created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);

  const result = await db.prepare(sql).bind(...params).all<SharedWorkflowRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  return { workflows: rows.slice(0, limit), hasMore };
}

export async function getWorkflowCommentsFromD1(
  db: D1Database,
  workflowOwnerId: string,
  workflowId: number,
  limit = 50,
  offset = 0,
): Promise<{ comments: Record<string, unknown>[]; hasMore: boolean }> {
  const sql = `SELECT * FROM workflow_comments
    WHERE "workflowOwnerId" = ? AND "workflowId" = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const result = await db
    .prepare(sql)
    .bind(workflowOwnerId, workflowId, limit + 1, offset)
    .all();
  const rows = (result.results ?? []) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  return { comments: rows.slice(0, limit), hasMore };
}

export interface RoyaltyStatsRow {
  date: string;
  total: number;
}

export async function getWorkflowRoyaltyStats(
  db: D1Database,
  ownerUserId: string,
  fromTs: number,
): Promise<{ byDay: RoyaltyStatsRow[]; totalAmount: number }> {
  const sql = `SELECT created_at, royaltyAmountVnd FROM workflow_royalties
    WHERE "workflowOwnerId" = ? AND created_at >= ? ORDER BY created_at ASC`;
  const result = await db.prepare(sql).bind(ownerUserId, fromTs).all<{
    created_at?: number;
    royaltyAmountVnd?: number;
  }>();
  const byDate = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ts = r.created_at ?? 0;
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(r.royaltyAmountVnd || 0));
  }
  const byDay = Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalAmount = byDay.reduce((sum, d) => sum + d.total, 0);
  return { byDay, totalAmount };
}

export async function listWorkflowRoyalties(
  db: D1Database,
  ownerUserId: string,
  fromTs: number,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const sql = `SELECT * FROM workflow_royalties
    WHERE "workflowOwnerId" = ? AND created_at >= ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const result = await db
    .prepare(sql)
    .bind(ownerUserId, fromTs, limit, offset)
    .all();
  return (result.results ?? []) as Record<string, unknown>[];
}
