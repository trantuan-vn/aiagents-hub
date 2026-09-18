import { billingEconomicsFromConfig, roundCredits, usdToCredits, type BillingEconomics } from '../../../admin/service/credit.js';

export type CreditLotSource = 'purchased' | 'included' | 'grace';

export type CreditLot = {
  credits: number;
  remaining: number;
  expiresAt: string;
  source: CreditLotSource;
  includedCogsUsdCap?: number;
  includedCogsUsdSpent?: number;
};

export function parseCreditLots(raw: unknown): CreditLot[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeLots(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return normalizeLots(raw);
  return [];
}

function normalizeLots(rows: unknown[]): CreditLot[] {
  const lots: CreditLot[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const remaining = roundCredits(Number(r.remaining ?? r.credits ?? 0));
    if (remaining <= 0) continue;
    const expiresAt = String(r.expiresAt ?? r.expires_at ?? '');
    if (!expiresAt) continue;
    const source: CreditLotSource =
      r.source === 'included' ? 'included' : r.source === 'grace' ? 'grace' : 'purchased';
    const capRaw = Number(r.includedCogsUsdCap ?? r.included_cogs_usd_cap);
    const spentRaw = Number(r.includedCogsUsdSpent ?? r.included_cogs_usd_spent);
    const lot: CreditLot = {
      credits: roundCredits(Number(r.credits ?? remaining)),
      remaining,
      expiresAt,
      source,
    };
    if (source === 'included' && Number.isFinite(capRaw) && capRaw > 0) lot.includedCogsUsdCap = capRaw;
    if (source === 'included' && Number.isFinite(spentRaw) && spentRaw > 0) lot.includedCogsUsdSpent = spentRaw;
    lots.push(lot);
  }
  return lots;
}

export function serializeCreditLots(lots: CreditLot[]): string {
  return JSON.stringify(lots.filter((l) => l.remaining > 0));
}

export function isCreditWallet(user: Record<string, unknown>): boolean {
  const cur = String(user.walletCurrency ?? user.wallet_currency ?? '').toUpperCase();
  return cur === 'CR';
}

export function expiryIso(days: number, from = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + Math.max(1, days));
  return d.toISOString();
}

export function liveLots(lots: CreditLot[], now = new Date()): CreditLot[] {
  const t = now.getTime();
  return lots.filter((lot) => lot.remaining > 0 && !Number.isNaN(Date.parse(lot.expiresAt)) && Date.parse(lot.expiresAt) > t);
}

export function creditBalanceFromLots(lots: CreditLot[], now = new Date()): number {
  return roundCredits(liveLots(lots, now).reduce((sum, lot) => sum + lot.remaining, 0));
}

export function soonestExpiry(lots: CreditLot[], now = new Date()): string | null {
  const live = liveLots(lots, now);
  if (!live.length) return null;
  return live.reduce((min, lot) => (lot.expiresAt < min ? lot.expiresAt : min), live[0].expiresAt);
}

/** Interpret wallet as Credit; lazy-convert leftover USD balances. */
export function resolveCreditBalance(
  user: Record<string, unknown>,
  eco: BillingEconomics,
  now = new Date(),
): { credits: number; lots: CreditLot[]; migrated: boolean } {
  const lots = parseCreditLots(user.creditLotsJson ?? user.credit_lots_json);
  const live = liveLots(lots, now);
  if (isCreditWallet(user) || live.length) {
    return { credits: creditBalanceFromLots(live, now), lots: live, migrated: false };
  }
  const usd = Number(user.walletBalance ?? user.wallet_balance ?? 0) || 0;
  const credits = usdToCredits(usd, eco.creditPriceUsd);
  if (credits <= 0) return { credits: 0, lots: [], migrated: usd > 0 };
  return {
    credits,
    lots: [
      {
        credits,
        remaining: credits,
        expiresAt: expiryIso(eco.creditExpiryDays, now),
        source: 'purchased',
      },
    ],
    migrated: true,
  };
}

export function debitCreditLots(
  lots: CreditLot[],
  amount: number,
  now = new Date(),
  opts?: { cogsAiUsd?: number; includedCogsUsdCap?: number; graceOnly?: boolean },
): { lots: CreditLot[]; remainingToDebit: number } {
  let left = roundCredits(amount);
  const cogs = Number(opts?.cogsAiUsd ?? 0) || 0;
  const next: CreditLot[] = [];
  const ordered = liveLots(lots, now).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  for (const lot of ordered) {
    if (left <= 0) {
      next.push(lot);
      continue;
    }
    if (opts?.graceOnly) {
      if (lot.source !== 'grace') {
        next.push(lot);
        continue;
      }
    } else if (lot.source === 'grace') {
      next.push(lot);
      continue;
    }
    if (lot.source === 'included' && includedCapBlocks(lot, cogs, opts?.includedCogsUsdCap)) {
      next.push(lot);
      continue;
    }
    const take = Math.min(lot.remaining, left);
    const remaining = roundCredits(lot.remaining - take);
    left = roundCredits(left - take);
    const spent =
      lot.source === 'included' && cogs > 0
        ? Math.round((Number(lot.includedCogsUsdSpent ?? 0) + cogs) * 1e8) / 1e8
        : lot.includedCogsUsdSpent;
    if (remaining > 0) next.push({ ...lot, remaining, includedCogsUsdSpent: spent });
  }
  return { lots: next, remainingToDebit: left };
}

function includedCapBlocks(lot: CreditLot, cogsAiUsd: number, ecoCap?: number): boolean {
  const cap = lot.includedCogsUsdCap ?? ecoCap;
  if (cap == null || cap <= 0 || cogsAiUsd <= 0) return false;
  const spent = Number(lot.includedCogsUsdSpent ?? 0) || 0;
  return spent + cogsAiUsd > cap;
}

export function creditPurchasedLots(
  lots: CreditLot[],
  credits: number,
  eco: BillingEconomics,
  now = new Date(),
): CreditLot[] {
  const add = roundCredits(credits);
  if (add <= 0) return liveLots(lots, now);
  return [
    ...liveLots(lots, now),
    {
      credits: add,
      remaining: add,
      expiresAt: expiryIso(eco.creditExpiryDays, now),
      source: 'purchased',
    },
  ];
}

export function creditIncludedLots(
  lots: CreditLot[],
  credits: number,
  expiresAt: string,
  includedCogsUsdCap?: number,
  now = new Date(),
): CreditLot[] {
  const add = roundCredits(credits);
  if (add <= 0) return liveLots(lots, now);
  const lot: CreditLot = {
    credits: add,
    remaining: add,
    expiresAt,
    source: 'included',
  };
  if (includedCogsUsdCap != null && includedCogsUsdCap > 0) lot.includedCogsUsdCap = includedCogsUsdCap;
  return [...liveLots(lots, now), lot];
}

export function applyWalletCreditDebit(
  user: Record<string, unknown>,
  creditsCharged: number,
  eco: BillingEconomics,
  now = new Date(),
  opts?: { cogsAiUsd?: number; includedCogsUsdCap?: number },
): { walletBalance: number; walletCurrency: 'CR'; creditLotsJson: string } {
  const resolved = resolveCreditBalance(user, eco, now);
  const { lots, remainingToDebit } = debitCreditLots(resolved.lots, creditsCharged, now, opts);
  if (remainingToDebit > 0) {
    throw new Error('Insufficient wallet balance');
  }
  const credits = creditBalanceFromLots(lots, now);
  return { walletBalance: credits, walletCurrency: 'CR', creditLotsJson: serializeCreditLots(lots) };
}

function paidPlanTopUpGate(user: Record<string, unknown>, eco: BillingEconomics): { canBuy: boolean; cap?: number } {
  const source = String(user.planSource ?? user.plan_source ?? '').toLowerCase();
  const sub = String(user.paypalSubscriptionId ?? user.paypal_subscription_id ?? '').trim();
  let plan = String(user.planId ?? user.plan_id ?? '').toLowerCase();
  if (plan === 'enterprise') plan = 'business';
  const entitled = source === 'admin' || source === 'paypal' || source === 'order' || sub.length > 0;
  if (!entitled) return { canBuy: false };
  if (plan === 'starter') return { canBuy: true, cap: 20_000 };
  if (plan === 'pro') return { canBuy: true, cap: eco.maxCreditBalancePro ?? 50_000 };
  if (plan === 'business') return { canBuy: true, cap: 200_000 };
  return { canBuy: false };
}

export function applyWalletCreditTopUp(
  user: Record<string, unknown>,
  creditsToAdd: number,
  eco: BillingEconomics,
  now = new Date(),
): { walletBalance: number; walletCurrency: 'CR'; creditLotsJson: string } {
  const gate = paidPlanTopUpGate(user, eco);
  if (!gate.canBuy) {
    throw new Error('Credit packs are not available on the Free plan');
  }
  const resolved = resolveCreditBalance(user, eco, now);
  const lots = creditPurchasedLots(resolved.lots, creditsToAdd, eco, now);
  const credits = creditBalanceFromLots(lots, now);
  if (gate.cap != null && credits > gate.cap) {
    throw new Error('Credit balance exceeds plan maximum');
  }
  return { walletBalance: credits, walletCurrency: 'CR', creditLotsJson: serializeCreditLots(lots) };
}

export function creditGraceLots(
  lots: CreditLot[],
  credits: number,
  expiresAt: string,
  now = new Date(),
): CreditLot[] {
  const add = roundCredits(credits);
  const live = liveLots(lots, now);
  if (add <= 0) return live;
  const existing = live.find((l) => l.source === 'grace');
  if (existing) {
    return live.map((l) =>
      l.source === 'grace'
        ? { ...l, credits: roundCredits(l.credits + add), remaining: roundCredits(l.remaining + add), expiresAt }
        : l,
    );
  }
  return [...live, { credits: add, remaining: add, expiresAt, source: 'grace' }];
}

export function defaultEconomics(): BillingEconomics {
  return billingEconomicsFromConfig();
}
