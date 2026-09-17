import { creditsToUsd, roundCredits, usdToCredits } from '../service/credit.js';
import { getBillingEconomicsFromEnv } from '../service/get-billing-economics.js';
import { roundUsdAmount } from '../service/pricing.js';
import { resolveCreditBalance } from '../../member/workflows/billing/credit-wallet.js';

export type DualAmount = {
  usd: number;
  credits: number;
};

export type UserEconomicsProfile = {
  userId: string;
  identifier: string;
  planId?: string;
  membershipTier?: string;
  referrerId?: string;
  wallet: DualAmount;
};

export type UserEconomicsClassRow = {
  modelClass: string;
  runs: number;
  userCharged: DualAmount;
  hubRevenue: DualAmount;
  cogsAi: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
};

export type UserEconomicsSeriesPoint = {
  period: string;
  hubRevenueUsd: number;
  cogsAiUsd: number;
  contributionUsd: number;
  creditsCharged: number;
};

export type UserEconomicsTopUser = {
  userId: string;
  identifier: string;
  runs: number;
  userCharged: DualAmount;
  hubRevenue: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
};

export type UserEconomicsReport = {
  scope: 'all' | 'user';
  email: string | null;
  hours: number;
  creditPriceUsd: number;
  fromMs: number;
  toMs: number;
  groupBy: 'day' | 'month';
  profile: UserEconomicsProfile | null;
  runs: number;
  orders: number;
  /** What the member wallet was debited (usage + royalty). */
  userCharged: DualAmount;
  /** Hub recognized usage revenue (royalty pass-through excluded). */
  hubRevenue: DualAmount;
  cogsAi: DualAmount;
  cogsInfra: DualAmount;
  paymentFee: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
  /** Royalty this user paid when running someone else's workflow. */
  royaltyPaid: DualAmount;
  /** Royalty this user earned as workflow owner. */
  royaltyEarned: DualAmount;
  /** Referral commission this user earned as referrer. */
  commissionEarned: DualAmount;
  /** Referral commission Hub owes because this user (or all users) topped up. */
  commissionPaid: DualAmount;
  /** Completed top-ups in the window. */
  topUp: DualAmount;
  /** Contribution minus referral commission paid on this user's top-ups. */
  hubNet: DualAmount;
  byClass: UserEconomicsClassRow[];
  series: UserEconomicsSeriesPoint[];
  topUsers: UserEconomicsTopUser[];
};

export class UserEconomicsNotFoundError extends Error {
  constructor(email: string) {
    super(`User not found: ${email}`);
    this.name = 'UserEconomicsNotFoundError';
  }
}

export function normalizeEconomicsEmail(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/** 0 = all time. Default 30 days. Cap 5 years. */
export function parseEconomicsHours(raw: string | undefined): number {
  if (raw === 'all' || raw === '0') return 0;
  const n = Number(raw ?? 720);
  if (!Number.isFinite(n)) return 720;
  return Math.min(24 * 365 * 5, Math.max(0, Math.floor(n)));
}

function roundUsdSigned(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const factor = 1e8;
  return Math.round(amount * factor) / factor;
}

function creditsFromUsdSigned(usd: number, creditPriceUsd: number): number {
  const price = creditPriceUsd > 0 ? creditPriceUsd : 0.0077;
  const n = usd / price;
  if (!Number.isFinite(n) || n === 0) return 0;
  return n < 0 ? -roundCredits(Math.abs(n)) : roundCredits(n);
}

export function dualFromUsd(usd: number, creditPriceUsd: number): DualAmount {
  const n = Number(usd) || 0;
  return { usd: roundUsdSigned(n), credits: creditsFromUsdSigned(n, creditPriceUsd) };
}

export function dualFromCredits(credits: number, creditPriceUsd: number): DualAmount {
  const n = Number(credits) || 0;
  return { credits: roundCredits(n), usd: creditsToUsd(n, creditPriceUsd) };
}

/** Prefer recorded Credits (what the member saw); fall back to USD conversion. */
export function preferCredits(credits: number, usd: number, creditPriceUsd: number): DualAmount {
  if ((Number(credits) || 0) > 0) return dualFromCredits(credits, creditPriceUsd);
  return dualFromUsd(usd, creditPriceUsd);
}

/** Keep both ledgers when present; convert only the missing side. */
export function dualHybrid(usd: number, credits: number, creditPriceUsd: number): DualAmount {
  const u = Number(usd) || 0;
  const c = Number(credits) || 0;
  return {
    usd: u > 0 ? roundUsdAmount(u) : creditsToUsd(c, creditPriceUsd),
    credits: c > 0 ? roundCredits(c) : usdToCredits(u, creditPriceUsd),
  };
}

export function hubNetUsd(contributionUsd: number, referralCommissionUsd: number): number {
  return roundUsdSigned((Number(contributionUsd) || 0) - (Number(referralCommissionUsd) || 0));
}

export function contributionPct(contributionUsd: number, revenueUsd: number): number {
  if (!(revenueUsd > 0)) return 0;
  return Math.round((contributionUsd / revenueUsd) * 10000) / 100;
}

export function economicsWindow(hours: number, now = Date.now()): { fromMs: number; toMs: number; groupBy: 'day' | 'month' } {
  const toMs = now;
  const fromMs = hours > 0 ? toMs - hours * 60 * 60 * 1000 : 0;
  const groupBy: 'day' | 'month' = hours === 0 || hours > 90 * 24 ? 'month' : 'day';
  return { fromMs, toMs, groupBy };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  try {
    const row = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .first<{ name?: string }>();
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

type UsageTotals = {
  runs: number;
  creditsUsage: number;
  creditsRoyalty: number;
  creditsCharged: number;
  revenueUsd: number;
  cogsAiUsd: number;
  cogsInfraUsd: number;
  paymentFeeUsd: number;
  contributionUsd: number;
  royaltyPaidUsd: number;
};

const EMPTY_USAGE: UsageTotals = {
  runs: 0,
  creditsUsage: 0,
  creditsRoyalty: 0,
  creditsCharged: 0,
  revenueUsd: 0,
  cogsAiUsd: 0,
  cogsInfraUsd: 0,
  paymentFeeUsd: 0,
  contributionUsd: 0,
  royaltyPaidUsd: 0,
};

function usageWhere(userId?: string): { sql: string; extra: unknown[] } {
  let sql = `WHERE created_at >= ? AND created_at <= ? AND (isError = 0 OR isError IS NULL)`;
  const extra: unknown[] = [];
  if (userId) {
    sql += ` AND user_id = ?`;
    extra.push(userId);
  }
  return { sql, extra };
}

async function queryUsageTotals(
  db: D1Database,
  fromMs: number,
  toMs: number,
  userId?: string,
): Promise<UsageTotals> {
  const { sql, extra } = usageWhere(userId);
  const binds = [fromMs, toMs, ...extra];
  const full = `
    SELECT
      COUNT(*) as runs,
      SUM(COALESCE(credits_usage, creditsUsage, 0)) as creditsUsage,
      SUM(COALESCE(credits_royalty, creditsRoyalty, 0)) as creditsRoyalty,
      SUM(COALESCE(credits_charged, creditsCharged, 0)) as creditsCharged,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as revenueUsd,
      SUM(COALESCE(cogs_ai_usd, cogsAiUsd, 0)) as cogsAiUsd,
      SUM(COALESCE(cogs_infra_usd_est, cogsInfraUsdEst, 0)) as cogsInfraUsd,
      SUM(COALESCE(payment_fee_usd, paymentFeeUsd, 0)) as paymentFeeUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd,
      SUM(COALESCE(workflowRoyaltyVnd, workflow_royalty_vnd, 0)) as royaltyPaidUsd
    FROM service_usages
    ${sql}
  `;
  const legacy = `
    SELECT
      COUNT(*) as runs,
      0 as creditsUsage,
      0 as creditsRoyalty,
      0 as creditsCharged,
      SUM(COALESCE(cost, 0)) as revenueUsd,
      0 as cogsAiUsd,
      0 as cogsInfraUsd,
      0 as paymentFeeUsd,
      0 as contributionUsd,
      SUM(COALESCE(workflowRoyaltyVnd, 0)) as royaltyPaidUsd
    FROM service_usages
    ${sql}
  `;
  try {
    const row = await db.prepare(full).bind(...binds).first<Record<string, unknown>>();
    return mapUsage(row);
  } catch {
    try {
      const row = await db.prepare(legacy).bind(...binds).first<Record<string, unknown>>();
      return mapUsage(row);
    } catch {
      return EMPTY_USAGE;
    }
  }
}

function mapUsage(row: Record<string, unknown> | null): UsageTotals {
  if (!row) return EMPTY_USAGE;
  return {
    runs: num(row.runs),
    creditsUsage: num(row.creditsUsage),
    creditsRoyalty: num(row.creditsRoyalty),
    creditsCharged: num(row.creditsCharged),
    revenueUsd: num(row.revenueUsd),
    cogsAiUsd: num(row.cogsAiUsd),
    cogsInfraUsd: num(row.cogsInfraUsd),
    paymentFeeUsd: num(row.paymentFeeUsd),
    contributionUsd: num(row.contributionUsd),
    royaltyPaidUsd: num(row.royaltyPaidUsd),
  };
}

async function queryByClass(
  db: D1Database,
  fromMs: number,
  toMs: number,
  creditPriceUsd: number,
  userId?: string,
): Promise<UserEconomicsClassRow[]> {
  const { sql, extra } = usageWhere(userId);
  const q = `
    SELECT
      COALESCE(model_class, modelClass, 'unknown') as modelClass,
      COUNT(*) as runs,
      SUM(COALESCE(credits_charged, creditsCharged, 0)) as creditsCharged,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as revenueUsd,
      SUM(COALESCE(cogs_ai_usd, cogsAiUsd, 0)) as cogsAiUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd
    FROM service_usages
    ${sql}
    GROUP BY COALESCE(model_class, modelClass, 'unknown')
  `;
  try {
    const result = await db.prepare(q).bind(fromMs, toMs, ...extra).all<Record<string, unknown>>();
    return (result.results ?? []).map((r) => {
      const revenueUsd = num(r.revenueUsd);
      const contributionUsd = num(r.contributionUsd);
      return {
        modelClass: str(r.modelClass) || 'unknown',
        runs: num(r.runs),
        userCharged: dualHybrid(revenueUsd, num(r.creditsCharged), creditPriceUsd),
        hubRevenue: dualFromUsd(revenueUsd, creditPriceUsd),
        cogsAi: dualFromUsd(num(r.cogsAiUsd), creditPriceUsd),
        contribution: dualFromUsd(contributionUsd, creditPriceUsd),
        contributionPct: contributionPct(contributionUsd, revenueUsd),
      };
    });
  } catch {
    return [];
  }
}

async function querySeries(
  db: D1Database,
  fromMs: number,
  toMs: number,
  groupBy: 'day' | 'month',
  userId?: string,
): Promise<UserEconomicsSeriesPoint[]> {
  const { sql, extra } = usageWhere(userId);
  const periodExpr =
    groupBy === 'month'
      ? `strftime('%Y-%m', datetime(created_at/1000, 'unixepoch'))`
      : `date(created_at/1000, 'unixepoch')`;
  const q = `
    SELECT
      ${periodExpr} as period,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as hubRevenueUsd,
      SUM(COALESCE(cogs_ai_usd, cogsAiUsd, 0)) as cogsAiUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd,
      SUM(COALESCE(credits_charged, creditsCharged, 0)) as creditsCharged
    FROM service_usages
    ${sql}
    GROUP BY period
    ORDER BY period ASC
  `;
  try {
    const result = await db.prepare(q).bind(fromMs, toMs, ...extra).all<Record<string, unknown>>();
    return (result.results ?? []).map((r) => ({
      period: str(r.period),
      hubRevenueUsd: num(r.hubRevenueUsd),
      cogsAiUsd: num(r.cogsAiUsd),
      contributionUsd: num(r.contributionUsd),
      creditsCharged: num(r.creditsCharged),
    }));
  } catch {
    return [];
  }
}

async function queryTopUsers(
  db: D1Database,
  fromMs: number,
  toMs: number,
  creditPriceUsd: number,
  limit = 25,
): Promise<UserEconomicsTopUser[]> {
  const q = `
    SELECT
      user_id as userId,
      COUNT(*) as runs,
      SUM(COALESCE(credits_charged, creditsCharged, 0)) as creditsCharged,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as revenueUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd
    FROM service_usages
    WHERE created_at >= ? AND created_at <= ? AND (isError = 0 OR isError IS NULL)
    GROUP BY user_id
    ORDER BY contributionUsd DESC
    LIMIT ?
  `;
  try {
    const result = await db.prepare(q).bind(fromMs, toMs, limit).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const identifiers = await mapUserIdentifiers(
      db,
      rows.map((r) => str(r.userId)).filter(Boolean),
    );
    return rows.map((r) => {
      const userId = str(r.userId);
      const revenueUsd = num(r.revenueUsd);
      const contributionUsd = num(r.contributionUsd);
      return {
        userId,
        identifier: identifiers.get(userId) ?? userId,
        runs: num(r.runs),
        userCharged: dualHybrid(revenueUsd, num(r.creditsCharged), creditPriceUsd),
        hubRevenue: dualFromUsd(revenueUsd, creditPriceUsd),
        contribution: dualFromUsd(contributionUsd, creditPriceUsd),
        contributionPct: contributionPct(contributionUsd, revenueUsd),
      };
    });
  } catch {
    return [];
  }
}

async function mapUserIdentifiers(db: D1Database, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds)].slice(0, 50);
  if (!unique.length) return map;
  try {
    const placeholders = unique.map(() => '?').join(',');
    const result = await db
      .prepare(`SELECT user_id, identifier FROM users WHERE user_id IN (${placeholders})`)
      .bind(...unique)
      .all<{ user_id?: string; identifier?: string }>();
    for (const row of result.results ?? []) {
      const id = str(row.user_id);
      const identifier = str(row.identifier);
      if (id && identifier && !map.has(id)) map.set(id, identifier);
    }
  } catch {
    // identifier lookup is optional
  }
  return map;
}

async function querySum(
  db: D1Database,
  sql: string,
  binds: unknown[],
): Promise<number> {
  try {
    const row = await db.prepare(sql).bind(...binds).first<{ total?: number }>();
    return num(row?.total);
  } catch {
    return 0;
  }
}

async function queryOrders(
  db: D1Database,
  fromMs: number,
  toMs: number,
  userId?: string,
): Promise<{ orders: number; topUpUsd: number; creditedCredits: number }> {
  const empty = { orders: 0, topUpUsd: 0, creditedCredits: 0 };
  if (!(await tableExists(db, 'orders'))) return empty;
  const userClause = userId ? ` AND user_id = ?` : '';
  const binds: unknown[] = [fromMs, toMs];
  if (userId) binds.push(userId);
  const withCredits = `
    SELECT COUNT(*) as orders,
           COALESCE(SUM("finalAmount"), 0) as topUpUsd,
           COALESCE(SUM("creditedCredits"), 0) as creditedCredits
    FROM orders
    WHERE status = 'COMPLETED' AND created_at >= ? AND created_at <= ?${userClause}
  `;
  const usdOnly = `
    SELECT COUNT(*) as orders,
           COALESCE(SUM("finalAmount"), 0) as topUpUsd,
           0 as creditedCredits
    FROM orders
    WHERE status = 'COMPLETED' AND created_at >= ? AND created_at <= ?${userClause}
  `;
  try {
    const row = await db.prepare(withCredits).bind(...binds).first<Record<string, unknown>>();
    return {
      orders: num(row?.orders),
      topUpUsd: num(row?.topUpUsd),
      creditedCredits: num(row?.creditedCredits),
    };
  } catch {
    try {
      const row = await db.prepare(usdOnly).bind(...binds).first<Record<string, unknown>>();
      return {
        orders: num(row?.orders),
        topUpUsd: num(row?.topUpUsd),
        creditedCredits: 0,
      };
    } catch {
      return empty;
    }
  }
}

async function findUserRow(db: D1Database, email: string): Promise<Record<string, unknown> | null> {
  try {
    const row = await db
      .prepare(
        `SELECT * FROM users WHERE lower(identifier) = ? OR lower(COALESCE(email, '')) = ? LIMIT 1`,
      )
      .bind(email, email)
      .first<Record<string, unknown>>();
    return row ?? null;
  } catch {
    try {
      const row = await db
        .prepare(`SELECT * FROM users WHERE lower(identifier) = ? LIMIT 1`)
        .bind(email)
        .first<Record<string, unknown>>();
      return row ?? null;
    } catch {
      return null;
    }
  }
}

function doIdFromEmail(env: Env, email: string): string | null {
  try {
    const ns = env.USER_DO;
    if (!ns) return null;
    return ns.idFromName(email).toString();
  } catch {
    return null;
  }
}

function profileFromRow(
  row: Record<string, unknown> | null,
  userId: string,
  email: string,
  creditPriceUsd: number,
  eco: Awaited<ReturnType<typeof getBillingEconomicsFromEnv>>,
): UserEconomicsProfile {
  const identifier = str(row?.identifier) || email;
  const walletCredits = row ? resolveCreditBalance(row, eco).credits : 0;
  return {
    userId,
    identifier,
    planId: str(row?.planId ?? row?.plan_id) || undefined,
    membershipTier: str(row?.membershipTier ?? row?.membership_tier) || undefined,
    referrerId: str(row?.referrerId ?? row?.referrer_id) || undefined,
    wallet: dualFromCredits(walletCredits, creditPriceUsd),
  };
}

export async function getUserEconomicsReport(
  env: Env,
  opts: { email?: string; hours?: number },
): Promise<UserEconomicsReport> {
  const db = env.D1DB;
  if (!db) throw new Error('D1 database binding not configured');

  const email = normalizeEconomicsEmail(opts.email);
  const hours = opts.hours ?? 720;
  const { fromMs, toMs, groupBy } = economicsWindow(hours);
  const eco = await getBillingEconomicsFromEnv(env);
  const price = eco.creditPriceUsd;

  let userId: string | undefined;
  let row: Record<string, unknown> | null = null;
  if (email) {
    row = await findUserRow(db, email);
    userId = str(row?.user_id ?? row?.userId) || doIdFromEmail(env, email) || undefined;
    if (!userId) throw new UserEconomicsNotFoundError(email);
  }

  const [usage, byClass, series, orders, hasCommissions, hasRoyalties] = await Promise.all([
    queryUsageTotals(db, fromMs, toMs, userId),
    queryByClass(db, fromMs, toMs, price, userId),
    querySeries(db, fromMs, toMs, groupBy, userId),
    queryOrders(db, fromMs, toMs, userId),
    tableExists(db, 'commissions'),
    tableExists(db, 'workflow_royalties'),
  ]);

  const commissionEarnedUsd = hasCommissions
    ? await querySum(
        db,
        userId
          ? `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions
             WHERE created_at >= ? AND created_at <= ? AND user_id = ?`
          : `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions
             WHERE created_at >= ? AND created_at <= ?`,
        userId ? [fromMs, toMs, userId] : [fromMs, toMs],
      )
    : 0;

  const commissionPaidUsd = hasCommissions
    ? await querySum(
        db,
        email
          ? `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions
             WHERE created_at >= ? AND created_at <= ? AND lower("referredUserId") = ?`
          : `SELECT COALESCE(SUM("commissionAmount"), 0) as total FROM commissions
             WHERE created_at >= ? AND created_at <= ?`,
        email ? [fromMs, toMs, email] : [fromMs, toMs],
      )
    : 0;

  const royaltyEarnedUsd = hasRoyalties
    ? await querySum(
        db,
        userId
          ? `SELECT COALESCE(SUM(COALESCE("royaltyAmountUsd", "royaltyAmountVnd", 0)), 0) as total
             FROM workflow_royalties
             WHERE created_at >= ? AND created_at <= ? AND "workflowOwnerId" = ?`
          : `SELECT COALESCE(SUM(COALESCE("royaltyAmountUsd", "royaltyAmountVnd", 0)), 0) as total
             FROM workflow_royalties
             WHERE created_at >= ? AND created_at <= ?`,
        userId ? [fromMs, toMs, userId] : [fromMs, toMs],
      )
    : 0;

  const topUsers = email ? [] : await queryTopUsers(db, fromMs, toMs, price);

  const empty =
    usage.runs === 0 &&
    orders.orders === 0 &&
    commissionEarnedUsd === 0 &&
    commissionPaidUsd === 0 &&
    royaltyEarnedUsd === 0;
  if (email && !row && empty) {
    throw new UserEconomicsNotFoundError(email);
  }

  const contributionUsd = usage.contributionUsd;
  const hubRevenueUsd = usage.revenueUsd;
  const netUsd = hubNetUsd(contributionUsd, commissionPaidUsd);

  return {
    scope: email ? 'user' : 'all',
    email: email || null,
    hours,
    creditPriceUsd: price,
    fromMs,
    toMs,
    groupBy,
    profile: email && userId ? profileFromRow(row, userId, email, price, eco) : null,
    runs: usage.runs,
    orders: orders.orders,
    userCharged: dualHybrid(hubRevenueUsd + usage.royaltyPaidUsd, usage.creditsCharged, price),
    hubRevenue: dualHybrid(hubRevenueUsd, usage.creditsUsage, price),
    cogsAi: dualFromUsd(usage.cogsAiUsd, price),
    cogsInfra: dualFromUsd(usage.cogsInfraUsd, price),
    paymentFee: dualFromUsd(usage.paymentFeeUsd, price),
    contribution: dualFromUsd(contributionUsd, price),
    contributionPct: contributionPct(contributionUsd, hubRevenueUsd),
    royaltyPaid: dualHybrid(usage.royaltyPaidUsd, usage.creditsRoyalty, price),
    royaltyEarned: dualFromUsd(royaltyEarnedUsd, price),
    commissionEarned: dualFromUsd(commissionEarnedUsd, price),
    commissionPaid: dualFromUsd(commissionPaidUsd, price),
    topUp: dualHybrid(orders.topUpUsd, orders.creditedCredits, price),
    hubNet: dualFromUsd(netUsd, price),
    byClass,
    series,
    topUsers,
  };
}
