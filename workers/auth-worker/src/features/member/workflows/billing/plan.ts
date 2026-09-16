import { billingEconomicsFromConfig, type BillingEconomics } from '../../../admin/service/credit.js';
import {
  creditBalanceFromLots,
  creditIncludedLots,
  liveLots,
  parseCreditLots,
  serializeCreditLots,
  type CreditLot,
} from './credit-wallet.js';

export type PlanId = 'free' | 'pro' | 'enterprise';

export type PlanEntitlement = {
  planId: PlanId;
  includedCredits: number;
  includedCogsUsdCap: number;
  maxCreditBalance?: number;
  canBuyCredits: boolean;
  /** 0 = unlimited */
  workflowRunsPerDay: number;
};

export const DEFAULT_PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlement> = {
  free: {
    planId: 'free',
    includedCredits: 200,
    includedCogsUsdCap: 0.5,
    canBuyCredits: false,
    workflowRunsPerDay: 20,
  },
  pro: {
    planId: 'pro',
    includedCredits: 5_000,
    includedCogsUsdCap: 8,
    maxCreditBalance: 100_000,
    canBuyCredits: true,
    workflowRunsPerDay: 500,
  },
  enterprise: {
    planId: 'enterprise',
    includedCredits: 25_000,
    includedCogsUsdCap: 80,
    canBuyCredits: true,
    workflowRunsPerDay: 0,
  },
};

export function parsePlanId(raw: unknown): PlanId {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'pro' || s === 'enterprise' || s === 'free') return s;
  return 'free';
}

/**
 * Explicit `planId` wins. Otherwise paying wallets (purchased lots / legacy USD /
 * monthly top-up) stay Pro so existing members are not locked out of credit packs.
 */
export function inferPlanId(user: Record<string, unknown>): PlanId {
  const explicit = user.planId ?? user.plan_id;
  if (explicit != null && String(explicit).trim() !== '') return parsePlanId(explicit);
  const topUp = Number(user.monthlyTopUpVnd ?? user.monthly_top_up_vnd ?? 0) || 0;
  if (topUp > 0) return 'pro';
  const lots = parseCreditLots(user.creditLotsJson ?? user.credit_lots_json);
  if (lots.some((lot) => lot.source === 'purchased' && lot.remaining > 0)) return 'pro';
  const currency = String(user.walletCurrency ?? user.wallet_currency ?? 'USD').toUpperCase();
  const balance = Number(user.walletBalance ?? user.wallet_balance ?? 0) || 0;
  if (currency !== 'CR' && balance > 0) return 'pro';
  return 'free';
}

export function periodYm(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodEndIso(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function entitlementFor(
  planId: PlanId,
  eco: BillingEconomics = billingEconomicsFromConfig(),
): PlanEntitlement {
  const base = { ...DEFAULT_PLAN_ENTITLEMENTS[planId] };
  if (planId === 'pro' && eco.maxCreditBalancePro != null && eco.maxCreditBalancePro > 0) {
    base.maxCreditBalance = eco.maxCreditBalancePro;
  }
  if (eco.includedCogsUsdCap != null && eco.includedCogsUsdCap > 0 && planId !== 'enterprise') {
    base.includedCogsUsdCap = Math.min(base.includedCogsUsdCap, eco.includedCogsUsdCap);
  }
  return base;
}

export type QuotaSnapshot = {
  planId: PlanId;
  entitlement: PlanEntitlement;
  workflowRunsToday: number;
  workflowRunsRemaining: number | null;
  canBuyCredits: boolean;
};

export function quotaFromUser(
  user: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): QuotaSnapshot {
  const planId = inferPlanId(user);
  const entitlement = entitlementFor(planId, eco);
  const on = String(user.workflowRunsOn ?? user.workflow_runs_on ?? '');
  const today = todayUtc(now);
  const runs = on === today ? Math.max(0, Math.floor(Number(user.workflowRunsToday ?? user.workflow_runs_today ?? 0) || 0)) : 0;
  const remaining =
    entitlement.workflowRunsPerDay > 0 ? Math.max(0, entitlement.workflowRunsPerDay - runs) : null;
  return {
    planId,
    entitlement,
    workflowRunsToday: runs,
    workflowRunsRemaining: remaining,
    canBuyCredits: entitlement.canBuyCredits,
  };
}

export function assertCanBuyCredits(quota: QuotaSnapshot): void {
  if (!quota.canBuyCredits) throw new Error('Credit packs are not available on the Free plan');
}

export function assertCanStartWorkflowRun(quota: QuotaSnapshot): void {
  if (quota.workflowRunsRemaining === null) return;
  if (quota.workflowRunsRemaining <= 0) throw new Error('Daily workflow run quota exceeded');
}

export type PlanSyncPatch = {
  planId: PlanId;
  planPeriodYm: string;
  workflowRunsToday: number;
  workflowRunsOn: string;
  walletBalance?: number;
  walletCurrency?: 'CR';
  creditLotsJson?: string;
  grantedIncluded: boolean;
};

/** Roll included credits at month boundary and reset the daily run counter. */
export function syncPlanPeriod(
  user: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): PlanSyncPatch {
  const planId = inferPlanId(user);
  const entitlement = entitlementFor(planId, eco);
  const ym = periodYm(now);
  const storedYm = String(user.planPeriodYm ?? user.plan_period_ym ?? '');
  const today = todayUtc(now);
  const storedOn = String(user.workflowRunsOn ?? user.workflow_runs_on ?? '');
  const runs = storedOn === today ? Math.max(0, Math.floor(Number(user.workflowRunsToday ?? user.workflow_runs_today ?? 0) || 0)) : 0;

  const patch: PlanSyncPatch = {
    planId,
    planPeriodYm: storedYm || ym,
    workflowRunsToday: runs,
    workflowRunsOn: today,
    grantedIncluded: false,
  };

  if (storedYm === ym) return patch;

  const lots = liveLots(parseCreditLots(user.creditLotsJson ?? user.credit_lots_json), now).filter(
    (lot) => lot.source !== 'included',
  );
  const nextLots: CreditLot[] =
    entitlement.includedCredits > 0
      ? creditIncludedLots(lots, entitlement.includedCredits, periodEndIso(ym), entitlement.includedCogsUsdCap, now)
      : lots;
  patch.planPeriodYm = ym;
  patch.grantedIncluded = entitlement.includedCredits > 0;
  patch.walletBalance = creditBalanceFromLots(nextLots, now);
  patch.walletCurrency = 'CR';
  patch.creditLotsJson = serializeCreditLots(nextLots);
  return patch;
}

export function incrementDailyWorkflowRuns(
  user: Record<string, unknown>,
  now = new Date(),
): { workflowRunsToday: number; workflowRunsOn: string } {
  const today = todayUtc(now);
  const on = String(user.workflowRunsOn ?? user.workflow_runs_on ?? '');
  const current = on === today ? Math.max(0, Math.floor(Number(user.workflowRunsToday ?? user.workflow_runs_today ?? 0) || 0)) : 0;
  return { workflowRunsToday: current + 1, workflowRunsOn: today };
}
