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
  definition?: string;
  isShared?: boolean | number;
  starCount?: number;
  starLabel?: string;
  usageCount?: number;
  totalEarningsUsd?: number;
  status?: string;
  created_at?: number;
  /** Average 1–5 from community ratings (workflow_user_stars). */
  communityStarAvg?: number;
  /** Number of users who rated this workflow. */
  communityStarCount?: number;
}

export interface WorkflowCommunityStarStats {
  communityStarAvg: number;
  communityStarCount: number;
}

/** Aggregate community star ratings for one shared workflow. */
export async function getWorkflowCommunityStarStats(
  db: D1Database,
  workflowOwnerId: string,
  workflowId: number,
): Promise<WorkflowCommunityStarStats> {
  const sql = `SELECT AVG("starCount") AS avgStar, COUNT(*) AS raterCount
    FROM workflow_user_stars
    WHERE "workflowOwnerId" = ? AND "workflowId" = ?`;
  const row = await db.prepare(sql).bind(workflowOwnerId, workflowId).first<{
    avgStar?: number | null;
    raterCount?: number;
  }>();
  const count = Number(row?.raterCount ?? 0);
  const avgRaw = row?.avgStar;
  const communityStarAvg =
    count > 0 && avgRaw != null ? Math.round(Number(avgRaw) * 10) / 10 : 0;
  return { communityStarAvg, communityStarCount: count };
}

export async function listSharedWorkflowsFromD1(
  db: D1Database,
  filters: SharedWorkflowFilters,
): Promise<{ workflows: SharedWorkflowRow[]; hasMore: boolean }> {
  const { limit = 50, offset = 0, starCount, search, excludeOwnerId } = filters;
  const conditions: string[] = ['w."isShared" = 1', 'w."status" = ?'];
  const params: (string | number)[] = ['published'];

  if (excludeOwnerId) {
    conditions.push('w."user_id" != ?');
    params.push(excludeOwnerId);
  }
  if (starCount != null && starCount >= 1 && starCount <= 5) {
    conditions.push(
      'CAST(ROUND(COALESCE(star_stats.avg_star, 0)) AS INTEGER) = ?',
    );
    params.push(starCount);
  }
  if (search?.trim()) {
    conditions.push('(w."name" LIKE ? OR w."description" LIKE ?)');
    const q = `%${search.trim()}%`;
    params.push(q, q);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `SELECT w.id, w.globalId, w.user_id, w.name, w.description, w.slug, w.isShared, w.starCount, w.starLabel,
      w.usageCount, w.totalEarningsUsd, w.status, w.created_at,
      COALESCE(star_stats.avg_star, 0) AS communityStarAvg,
      COALESCE(star_stats.rater_count, 0) AS communityStarCount
    FROM agent_workflows w
    LEFT JOIN (
      SELECT "workflowOwnerId", "workflowId",
        AVG("starCount") AS avg_star,
        COUNT(*) AS rater_count
      FROM workflow_user_stars
      GROUP BY "workflowOwnerId", "workflowId"
    ) star_stats ON star_stats."workflowOwnerId" = w.user_id AND star_stats."workflowId" = w.id
    WHERE ${whereClause}
    ORDER BY communityStarCount DESC, w.usageCount DESC, w.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);

  const result = await db.prepare(sql).bind(...params).all<SharedWorkflowRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  return { workflows: rows.slice(0, limit), hasMore };
}

export interface WorkflowUserStarRow {
  starCount?: number;
  label?: string;
}

/** User's rating from D1 (after DO cleanup). */
export async function getWorkflowUserStarFromD1(
  db: D1Database,
  consumerUserId: string,
  workflowKey: string,
): Promise<WorkflowUserStarRow | null> {
  const sql = `SELECT "starCount", "label" FROM workflow_user_stars
    WHERE user_id = ? AND "workflowKey" = ? LIMIT 1`;
  const row = await db
    .prepare(sql)
    .bind(consumerUserId, workflowKey)
    .first<WorkflowUserStarRow>();
  return row ?? null;
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
  const sql = `SELECT created_at, royaltyAmountUsd FROM workflow_royalties
    WHERE "workflowOwnerId" = ? AND created_at >= ? ORDER BY created_at ASC`;
  const result = await db.prepare(sql).bind(ownerUserId, fromTs).all<{
    created_at?: number;
    royaltyAmountUsd?: number;
  }>();
  const byDate = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ts = r.created_at ?? 0;
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(r.royaltyAmountUsd || 0));
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
