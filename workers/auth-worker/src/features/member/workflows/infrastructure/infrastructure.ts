import { triggerKindsJsonForRunner } from '../domain/share-grants.js';
import {
  summarizeWorkflowListTriggers,
  type SharedWorkflowTriggerSummary,
} from './list-trigger-summary.js';

export interface SharedWorkflowFilters {
  limit?: number;
  offset?: number;
  starCount?: number;
  search?: string;
  excludeOwnerId?: string;
  /** Login email of the viewer. User-only grants are listed only for that account. */
  viewerIdentifier?: string;
}

export interface SharedWorkflowRow {
  id?: number;
  globalId?: number;
  user_id?: string;
  name?: string;
  description?: string;
  tags?: string;
  definition?: string;
  isShared?: boolean | number;
  starCount?: number;
  starLabel?: string;
  usageCount?: number;
  totalEarningsUsd?: number;
  minPlanId?: string;
  graceWhenExhausted?: boolean | number;
  publicTriggerKinds?: string | null;
  shareGrants?: string | null;
  status?: string;
  created_at?: number;
  /** Average 1–5 from community ratings (workflow_user_stars). */
  communityStarAvg?: number;
  /** Number of users who rated this workflow. */
  communityStarCount?: number;
  /** Compact trigger metadata for list-page Open chat / Execute buttons. */
  triggers?: SharedWorkflowTriggerSummary;
}

export interface WorkflowCommunityStarStats {
  communityStarAvg: number;
  communityStarCount: number;
}

/**
 * Legacy rows (NULL share list) stay in the catalog. A saved list is visible when an
 * "all" row grants a trigger, or a "users" row lists this viewer's login email.
 */
const SHARE_GRANT_VISIBILITY_SQL = `(
  w."shareGrants" IS NULL
  OR TRIM(COALESCE(w."shareGrants", '')) = ''
  OR EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(w."shareGrants") THEN w."shareGrants" ELSE '[]' END) AS grant
    WHERE json_extract(grant.value, '$.audience') = 'all'
      AND IFNULL(json_array_length(json_extract(grant.value, '$.triggerKinds')), 0) > 0
  )
  OR EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(w."shareGrants") THEN w."shareGrants" ELSE '[]' END) AS grant,
         json_each(json_extract(grant.value, '$.emails')) AS email
    WHERE json_extract(grant.value, '$.audience') = 'users'
      AND lower(email.value) = ?
      AND IFNULL(json_array_length(json_extract(grant.value, '$.triggerKinds')), 0) > 0
  )
)`;

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
  const { limit = 50, offset = 0, starCount, search, excludeOwnerId, viewerIdentifier } = filters;
  const conditions: string[] = ['w."isShared" = 1', 'COALESCE(w."isEnterprise", 0) = 0', 'w."status" = ?'];
  const params: (string | number)[] = ['published'];
  const viewerEmail = String(viewerIdentifier ?? '').trim().toLowerCase();
  conditions.push(SHARE_GRANT_VISIBILITY_SQL);
  params.push(viewerEmail);

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
  const sql = `SELECT w.id, w.globalId, w.user_id, w.name, w.description, w.tags, w.definition, w.isShared, w.starCount, w.starLabel,
      w.usageCount, w.totalEarningsUsd, w.status, w.created_at, w.minPlanId, w.graceWhenExhausted, w.publicTriggerKinds, w.shareGrants,
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
  const workflows = rows.slice(0, limit).map(({ definition, shareGrants, ...rest }) => {
    const viewerKinds = triggerKindsJsonForRunner({
      publicTriggerKinds: rest.publicTriggerKinds,
      shareGrants,
      runnerIdentifier: viewerEmail,
    });
    const publicTriggerKinds = viewerKinds ?? rest.publicTriggerKinds;
    return {
      ...rest,
      publicTriggerKinds,
      triggers: summarizeWorkflowListTriggers(definition, publicTriggerKinds),
    };
  });
  return { workflows, hasMore };
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

export async function getPublishedSharedWorkflow(
  db: D1Database,
  ownerId: string,
  workflowId: number,
): Promise<{ id: number; user_id: string } | null> {
  const sql = `SELECT id, user_id FROM agent_workflows
    WHERE user_id = ? AND id = ? AND "isShared" = 1 AND COALESCE("isEnterprise", 0) = 0 AND status = 'published' LIMIT 1`;
  return (await db.prepare(sql).bind(ownerId, workflowId).first<{ id: number; user_id: string }>()) ?? null;
}

export async function findUniquePublishedSharedWorkflowOwner(
  db: D1Database,
  workflowId: number,
): Promise<string | null> {
  const sql = `SELECT user_id FROM agent_workflows
    WHERE id = ? AND "isShared" = 1 AND COALESCE("isEnterprise", 0) = 0 AND status = 'published' LIMIT 2`;
  const result = await db.prepare(sql).bind(workflowId).all<{ user_id?: string }>();
  const rows = result.results ?? [];
  if (rows.length !== 1) return null;
  const ownerId = String(rows[0]?.user_id ?? '').trim();
  return ownerId || null;
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
