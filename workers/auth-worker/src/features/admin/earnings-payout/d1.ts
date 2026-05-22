/** D1 aggregates for monthly commission & workflow royalty earnings. */

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodToRange(period: string): { fromTs: number; toTs: number } {
  const [y, m] = period.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  return { fromTs: from.getTime(), toTs: to.getTime() };
}

export interface PeriodEarningsRow {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
}

export async function getCommissionTotalsByUserForPeriod(
  db: D1Database,
  fromTs: number,
  toTs: number,
): Promise<Map<string, { identifier: string; amount: number }>> {
  const sql = `SELECT user_id, "referrerId", SUM("commissionAmount") AS total
    FROM commissions
    WHERE created_at >= ? AND created_at < ?
    GROUP BY user_id, "referrerId"`;
  const result = await db.prepare(sql).bind(fromTs, toTs).all<{
    user_id?: string;
    referrerId?: string;
    total?: number;
  }>();
  const map = new Map<string, { identifier: string; amount: number }>();
  for (const r of result.results ?? []) {
    const userId = String(r.user_id ?? '');
    const identifier = String(r.referrerId ?? '');
    if (!userId) continue;
    map.set(userId, {
      identifier: identifier || userId,
      amount: Number(r.total ?? 0) || 0,
    });
  }
  return map;
}

export async function getWorkflowRoyaltyTotalsByOwnerForPeriod(
  db: D1Database,
  fromTs: number,
  toTs: number,
): Promise<Map<string, number>> {
  const sql = `SELECT "workflowOwnerId", SUM("royaltyAmountVnd") AS total
    FROM workflow_royalties
    WHERE created_at >= ? AND created_at < ?
    GROUP BY "workflowOwnerId"`;
  const result = await db.prepare(sql).bind(fromTs, toTs).all<{
    workflowOwnerId?: string;
    total?: number;
  }>();
  const map = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ownerId = String(r.workflowOwnerId ?? '');
    if (!ownerId) continue;
    map.set(ownerId, Number(r.total ?? 0) || 0);
  }
  return map;
}

export async function resolveIdentifierFromD1(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const sql = `SELECT identifier FROM users WHERE user_id = ? LIMIT 1`;
  const row = await db.prepare(sql).bind(userId).first<{ identifier?: string }>();
  return row?.identifier ? String(row.identifier) : null;
}

export async function mergePeriodEarnings(
  db: D1Database,
  period: string,
): Promise<PeriodEarningsRow[]> {
  const { fromTs, toTs } = periodToRange(period);
  const [commissionMap, workflowMap] = await Promise.all([
    getCommissionTotalsByUserForPeriod(db, fromTs, toTs),
    getWorkflowRoyaltyTotalsByOwnerForPeriod(db, fromTs, toTs),
  ]);

  const allUserIds = new Set<string>([...commissionMap.keys(), ...workflowMap.keys()]);
  const rows: PeriodEarningsRow[] = [];

  for (const userId of allUserIds) {
    const commission = commissionMap.get(userId);
    const workflowTotal = workflowMap.get(userId) ?? 0;
    const commissionTotal = commission?.amount ?? 0;
    const total = commissionTotal + workflowTotal;
    if (total <= 0) continue;

    let identifier = commission?.identifier ?? '';
    if (!identifier) {
      identifier = (await resolveIdentifierFromD1(db, userId)) ?? userId;
    }

    rows.push({
      recipientUserId: userId,
      recipientIdentifier: identifier,
      commissionAmountVnd: commissionTotal,
      workflowRoyaltyAmountVnd: workflowTotal,
      totalAmountVnd: total,
    });
  }

  rows.sort((a, b) => b.totalAmountVnd - a.totalAmountVnd);
  return rows;
}

/** Earliest YYYY-MM with commission or workflow royalty activity. */
export async function getEarliestEarningPeriod(db: D1Database): Promise<string> {
  const row = await db
    .prepare(
      `SELECT MIN(ts) AS min_ts FROM (
        SELECT MIN(created_at) AS ts FROM commissions
        UNION ALL
        SELECT MIN(created_at) AS ts FROM workflow_royalties
      )`,
    )
    .first<{ min_ts?: number | null }>();
  const minTs = row?.min_ts;
  if (minTs == null || !Number.isFinite(minTs)) {
    return currentPeriod();
  }
  const d = new Date(minTs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive range of YYYY-MM from start through current month. */
export function enumeratePeriods(fromPeriod: string, toPeriod: string = currentPeriod()): string[] {
  const [fy, fm] = fromPeriod.split('-').map(Number);
  const [ty, tm] = toPeriod.split('-').map(Number);
  const periods: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return periods;
}
