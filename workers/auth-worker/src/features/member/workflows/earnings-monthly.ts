import {
  currentPeriod,
  enumeratePeriods,
  periodToRange,
} from '../../admin/earnings-payout/d1';
import type { RoyaltyStatsRow } from './infrastructure';

export interface WorkflowClosedPeriodRow {
  period: string;
  totalAmountUsd: number;
  payoutStatus: 'pending' | 'paid' | null;
}

export interface WorkflowEarningsMonthlySummary {
  currentPeriod: string;
  accruing: {
    period: string;
    totalAmountUsd: number;
    byDay: RoyaltyStatsRow[];
    royalties: Record<string, unknown>[];
  };
  closedPeriods: WorkflowClosedPeriodRow[];
  closedTotalAmountUsd: number;
}

function lastClosedPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getEarliestWorkflowRoyaltyPeriodForOwner(
  db: D1Database,
  ownerUserId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT MIN(created_at) AS min_ts FROM workflow_royalties WHERE "workflowOwnerId" = ?`,
    )
    .bind(ownerUserId)
    .first<{ min_ts?: number | null }>();
  const minTs = row?.min_ts;
  if (minTs == null || !Number.isFinite(minTs)) return null;
  const d = new Date(minTs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getWorkflowRoyaltyTotalInRange(
  db: D1Database,
  ownerUserId: string,
  fromTs: number,
  toTs: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT SUM(COALESCE("royaltyAmountUsd", "royaltyAmountVnd", 0)) AS total FROM workflow_royalties
       WHERE "workflowOwnerId" = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(ownerUserId, fromTs, toTs)
    .first<{ total?: number | null }>();
  return Number(row?.total ?? 0) || 0;
}

export async function getWorkflowRoyaltyStatsInRange(
  db: D1Database,
  ownerUserId: string,
  fromTs: number,
  toTs: number,
): Promise<{ byDay: RoyaltyStatsRow[]; totalAmount: number }> {
  const result = await db
    .prepare(
      `SELECT created_at, COALESCE("royaltyAmountUsd", "royaltyAmountVnd", 0) AS "royaltyAmountUsd" FROM workflow_royalties
       WHERE "workflowOwnerId" = ? AND created_at >= ? AND created_at < ?
       ORDER BY created_at ASC`,
    )
    .bind(ownerUserId, fromTs, toTs)
    .all<{ created_at?: number; royaltyAmountUsd?: number }>();

  const byDate = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ts = r.created_at ?? 0;
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(r.royaltyAmountUsd ?? 0));
  }
  const byDay = Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalAmount = byDay.reduce((sum, d) => sum + d.total, 0);
  return { byDay, totalAmount };
}

export async function listWorkflowRoyaltiesInRange(
  db: D1Database,
  ownerUserId: string,
  fromTs: number,
  toTs: number,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const result = await db
    .prepare(
      `SELECT * FROM workflow_royalties
       WHERE "workflowOwnerId" = ? AND created_at >= ? AND created_at < ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(ownerUserId, fromTs, toTs, limit, offset)
    .all();
  return (result.results ?? []) as Record<string, unknown>[];
}

async function getPayoutStatusByPeriod(
  db: D1Database,
  recipientUserId: string,
): Promise<Map<string, 'pending' | 'paid'>> {
  const result = await db
    .prepare(
      `SELECT period, status FROM earnings_payouts
       WHERE "recipientUserId" = ? AND period < ?`,
    )
    .bind(recipientUserId, currentPeriod())
    .all<{ period?: string; status?: string }>();
  const map = new Map<string, 'pending' | 'paid'>();
  for (const r of result.results ?? []) {
    const period = String(r.period ?? '');
    if (!period) continue;
    map.set(period, r.status === 'paid' ? 'paid' : 'pending');
  }
  return map;
}

export async function getWorkflowEarningsMonthlySummary(
  db: D1Database,
  ownerUserId: string,
  royaltiesLimit = 50,
): Promise<WorkflowEarningsMonthlySummary> {
  const current = currentPeriod();
  const { fromTs: accruingFrom, toTs: accruingTo } = periodToRange(current);

  const [accruingStats, accruingRoyalties, payoutByPeriod] = await Promise.all([
    getWorkflowRoyaltyStatsInRange(db, ownerUserId, accruingFrom, accruingTo),
    listWorkflowRoyaltiesInRange(db, ownerUserId, accruingFrom, accruingTo, royaltiesLimit, 0),
    getPayoutStatusByPeriod(db, ownerUserId),
  ]);

  const earliest = await getEarliestWorkflowRoyaltyPeriodForOwner(db, ownerUserId);
  const closedEnd = lastClosedPeriod();
  const closedPeriods: WorkflowClosedPeriodRow[] = [];

  if (earliest && earliest <= closedEnd) {
    const periods = enumeratePeriods(earliest, closedEnd);
    for (const p of periods) {
      const { fromTs, toTs } = periodToRange(p);
      const totalAmountUsd = await getWorkflowRoyaltyTotalInRange(db, ownerUserId, fromTs, toTs);
      if (totalAmountUsd <= 0) continue;
      closedPeriods.push({
        period: p,
        totalAmountUsd,
        payoutStatus: payoutByPeriod.get(p) ?? null,
      });
    }
    closedPeriods.sort((a, b) => b.period.localeCompare(a.period));
  }

  const closedTotalAmountUsd = closedPeriods.reduce((s, r) => s + r.totalAmountUsd, 0);

  return {
    currentPeriod: current,
    accruing: {
      period: current,
      totalAmountUsd: accruingStats.totalAmount,
      byDay: accruingStats.byDay,
      royalties: accruingRoyalties,
    },
    closedPeriods,
    closedTotalAmountUsd,
  };
}
