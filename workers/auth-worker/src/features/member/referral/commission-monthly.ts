import {
  currentPeriod,
  enumeratePeriods,
  periodToRange,
} from '../../admin/earnings-payout/d1';
import {
  getCommissionStatsInRange,
  listCommissionsFromD1,
} from './commission-d1';

export interface CommissionClosedPeriodRow {
  period: string;
  totalAmountVnd: number;
  payoutStatus: 'pending' | 'paid' | null;
}

export interface CommissionMonthlySummary {
  currentPeriod: string;
  accruing: {
    period: string;
    totalAmountVnd: number;
    byDay: { date: string; total: number }[];
    commissions: Record<string, unknown>[];
  };
  closedPeriods: CommissionClosedPeriodRow[];
  closedTotalAmountVnd: number;
}

function lastClosedPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getEarliestCommissionPeriodForUser(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT MIN(created_at) AS min_ts FROM commissions WHERE user_id = ?`)
    .bind(userId)
    .first<{ min_ts?: number | null }>();
  const minTs = row?.min_ts;
  if (minTs == null || !Number.isFinite(minTs)) return null;
  const d = new Date(minTs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getCommissionTotalInRange(
  db: D1Database,
  userId: string,
  fromTs: number,
  toTs: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT SUM("commissionAmount") AS total FROM commissions
       WHERE user_id = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(userId, fromTs, toTs)
    .first<{ total?: number | null }>();
  return Number(row?.total ?? 0) || 0;
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

export async function getCommissionMonthlySummary(
  db: D1Database,
  userId: string,
  commissionsLimit = 50,
): Promise<CommissionMonthlySummary> {
  const current = currentPeriod();
  const { fromTs: accruingFrom, toTs: accruingTo } = periodToRange(current);

  const [accruingStats, accruingCommissions, payoutByPeriod] = await Promise.all([
    getCommissionStatsInRange(db, userId, accruingFrom, accruingTo),
    listCommissionsFromD1(db, userId, accruingFrom, commissionsLimit, 0, accruingTo),
    getPayoutStatusByPeriod(db, userId),
  ]);

  const earliest = await getEarliestCommissionPeriodForUser(db, userId);
  const closedEnd = lastClosedPeriod();
  const closedPeriods: CommissionClosedPeriodRow[] = [];

  if (earliest && earliest <= closedEnd) {
    const periods = enumeratePeriods(earliest, closedEnd);
    for (const p of periods) {
      const { fromTs, toTs } = periodToRange(p);
      const totalAmountVnd = await getCommissionTotalInRange(db, userId, fromTs, toTs);
      if (totalAmountVnd <= 0) continue;
      closedPeriods.push({
        period: p,
        totalAmountVnd,
        payoutStatus: payoutByPeriod.get(p) ?? null,
      });
    }
    closedPeriods.sort((a, b) => b.period.localeCompare(a.period));
  }

  const closedTotalAmountVnd = closedPeriods.reduce((s, r) => s + r.totalAmountVnd, 0);

  return {
    currentPeriod: current,
    accruing: {
      period: current,
      totalAmountVnd: accruingStats.totalAmount,
      byDay: accruingStats.byDay,
      commissions: accruingCommissions,
    },
    closedPeriods,
    closedTotalAmountVnd,
  };
}
