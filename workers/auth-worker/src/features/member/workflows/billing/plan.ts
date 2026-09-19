import { billingEconomicsFromConfig, roundCredits, type BillingEconomics } from '../../../admin/service/credit.js';
import {
  creditBalanceFromLots,
  creditIncludedLots,
  liveLots,
  parseCreditLots,
  serializeCreditLots,
  type CreditLot,
} from './credit-wallet.js';

export const PLAN_IDS = ['free', 'starter', 'pro', 'business'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
};

export function planRank(id: PlanId): number {
  return PLAN_RANK[id];
}

export function parsePlanId(raw: unknown): PlanId {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'starter' || s === 'pro' || s === 'business') return s;
  if (s === 'enterprise') return 'business';
  return 'free';
}

export const PLAN_INTERVALS = [1, 3, 6, 12] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export const INTERVAL_DISCOUNT: Record<PlanInterval, number> = {
  1: 0,
  3: 0.1,
  6: 0.15,
  12: 0.2,
};

export function parsePlanInterval(raw: unknown): PlanInterval {
  const n = Number(raw);
  if (n === 3 || n === 6 || n === 12) return n;
  return 1;
}

export function prepaidUsd(listPerMonth: number, interval: PlanInterval): number {
  const factor = 1 - INTERVAL_DISCOUNT[interval];
  return Math.round(listPerMonth * interval * factor * 100) / 100;
}

export function effectiveUsdPerMonth(listPerMonth: number, interval: PlanInterval): number {
  return Math.round((prepaidUsd(listPerMonth, interval) / interval) * 100) / 100;
}

export type PlanEntitlement = {
  planId: PlanId;
  listPriceUsdPerMonth: number;
  includedCredits: number;
  includedCogsUsdCap: number;
  maxCreditBalance?: number;
  canBuyCredits: boolean;
  workflowRunsPerDay: number;
  maxCronJobs: number;
  canShareWorkflows: boolean;
  canUseWebhooks: boolean;
  canUseCron: boolean;
  canGraceWhenExhausted: boolean;
  graceCreditsPerMonth: number;
  graceRunsPerDay: number;
  graceCogsUsdCap: number;
  graceMinIntervalSec: number;
  maxAssignableMinPlanId: PlanId;
  showModelFamily: boolean;
  coeffNotifyLeadDays: number;
};

export const DEFAULT_PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlement> = {
  free: {
    planId: 'free',
    listPriceUsdPerMonth: 0,
    includedCredits: 150,
    includedCogsUsdCap: 0.4,
    canBuyCredits: false,
    workflowRunsPerDay: 15,
    maxCronJobs: 0,
    canShareWorkflows: false,
    canUseWebhooks: false,
    canUseCron: false,
    canGraceWhenExhausted: false,
    graceCreditsPerMonth: 0,
    graceRunsPerDay: 0,
    graceCogsUsdCap: 0,
    graceMinIntervalSec: 0,
    maxAssignableMinPlanId: 'free',
    showModelFamily: false,
    coeffNotifyLeadDays: 0,
  },
  starter: {
    planId: 'starter',
    listPriceUsdPerMonth: 4.9,
    includedCredits: 500,
    includedCogsUsdCap: 1.2,
    maxCreditBalance: 20_000,
    canBuyCredits: true,
    workflowRunsPerDay: 50,
    maxCronJobs: 3,
    canShareWorkflows: true,
    canUseWebhooks: true,
    canUseCron: true,
    canGraceWhenExhausted: true,
    graceCreditsPerMonth: 30,
    graceRunsPerDay: 5,
    graceCogsUsdCap: 0.3,
    graceMinIntervalSec: 120,
    maxAssignableMinPlanId: 'starter',
    showModelFamily: false,
    coeffNotifyLeadDays: 7,
  },
  pro: {
    planId: 'pro',
    listPriceUsdPerMonth: 19.9,
    includedCredits: 2_000,
    includedCogsUsdCap: 4,
    maxCreditBalance: 50_000,
    canBuyCredits: true,
    workflowRunsPerDay: 200,
    maxCronJobs: 15,
    canShareWorkflows: true,
    canUseWebhooks: true,
    canUseCron: true,
    canGraceWhenExhausted: true,
    graceCreditsPerMonth: 100,
    graceRunsPerDay: 15,
    graceCogsUsdCap: 1,
    graceMinIntervalSec: 60,
    maxAssignableMinPlanId: 'pro',
    showModelFamily: false,
    coeffNotifyLeadDays: 7,
  },
  business: {
    planId: 'business',
    listPriceUsdPerMonth: 99.9,
    includedCredits: 10_000,
    includedCogsUsdCap: 25,
    maxCreditBalance: 200_000,
    canBuyCredits: true,
    workflowRunsPerDay: 1_000,
    maxCronJobs: 100,
    canShareWorkflows: true,
    canUseWebhooks: true,
    canUseCron: true,
    canGraceWhenExhausted: true,
    graceCreditsPerMonth: 300,
    graceRunsPerDay: 40,
    graceCogsUsdCap: 3,
    graceMinIntervalSec: 30,
    maxAssignableMinPlanId: 'business',
    showModelFamily: true,
    coeffNotifyLeadDays: 30,
  },
};

function planSourceOf(user: Record<string, unknown>): string {
  return String(user.planSource ?? user.plan_source ?? '').toLowerCase();
}

function hasPaypalSub(user: Record<string, unknown>): boolean {
  return String(user.paypalSubscriptionId ?? user.paypal_subscription_id ?? '').trim().length > 0;
}

/**
 * Explicit PayPal / admin / prepaid-order plan wins. Never infer from Credit top-up, lots, or USD wallet.
 * Unpaid leftover `pro`/`enterprise` rows without a paid source resolve to free.
 */
export function resolvePlanId(user: Record<string, unknown>, now = new Date()): PlanId {
  const source = planSourceOf(user);
  const paid = source === 'admin' || source === 'paypal' || source === 'order' || hasPaypalSub(user);
  if (!paid) return 'free';
  if (source === 'order') {
    const end = Date.parse(String(user.planCurrentPeriodEnd ?? user.plan_current_period_end ?? ''));
    if (!Number.isFinite(end) || end <= now.getTime()) return 'free';
  }
  return parsePlanId(user.planId ?? user.plan_id);
}

/** @deprecated Use resolvePlanId — kept so leftover imports compile during the cutover. */
export const inferPlanId = resolvePlanId;

export function periodYm(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodEndIso(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

function utcDay(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10);
}

function paidPeriodEndIso(user: Record<string, unknown>): string {
  const raw = String(user.planCurrentPeriodEnd ?? user.plan_current_period_end ?? '');
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/** ~1 month + buffer. Far prepaid ends (3/6/12) still use UTC month-end lots. */
const INCLUDED_PAID_HORIZON_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * New included lots expire at the paid anniversary when that is the current 1-month cycle.
 * Otherwise they expire at UTC month-end, clipped to `planCurrentPeriodEnd` if sooner.
 */
export function includedGrantExpiresAt(user: Record<string, unknown>, now = new Date()): string {
  const calendarEnd = periodEndIso(periodYm(now));
  const paidEnd = paidPeriodEndIso(user);
  const paidEndMs = Date.parse(paidEnd);
  if (!Number.isFinite(paidEndMs) || paidEndMs <= now.getTime()) return calendarEnd;
  const calendarEndMs = Date.parse(calendarEnd);
  if (paidEndMs <= calendarEndMs) return paidEnd;
  if (paidEndMs - now.getTime() <= INCLUDED_PAID_HORIZON_MS) return paidEnd;
  return calendarEnd;
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
  if (eco.includedCogsUsdCap != null && eco.includedCogsUsdCap > 0 && planId !== 'business') {
    base.includedCogsUsdCap = Math.min(base.includedCogsUsdCap, eco.includedCogsUsdCap);
  }
  return base;
}

export type QuotaSnapshot = {
  planId: PlanId;
  planRank: number;
  entitlement: PlanEntitlement;
  workflowRunsToday: number;
  workflowRunsRemaining: number | null;
  canBuyCredits: boolean;
  graceRunsToday: number;
  graceRunsRemaining: number;
};

function dailyRuns(user: Record<string, unknown>, field: string, onField: string, now: Date): number {
  const on = String(user[onField] ?? user[onField.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] ?? '');
  const today = todayUtc(now);
  const raw = user[field] ?? user[field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
  return on === today ? Math.max(0, Math.floor(Number(raw ?? 0) || 0)) : 0;
}

export function quotaFromUser(
  user: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): QuotaSnapshot {
  const planId = resolvePlanId(user);
  const entitlement = entitlementFor(planId, eco);
  const runs = dailyRuns(user, 'workflowRunsToday', 'workflowRunsOn', now);
  const graceRuns = dailyRuns(user, 'graceRunsToday', 'graceRunsOn', now);
  const remaining =
    entitlement.workflowRunsPerDay > 0 ? Math.max(0, entitlement.workflowRunsPerDay - runs) : null;
  return {
    planId,
    planRank: planRank(planId),
    entitlement,
    workflowRunsToday: runs,
    workflowRunsRemaining: remaining,
    canBuyCredits: entitlement.canBuyCredits,
    graceRunsToday: graceRuns,
    graceRunsRemaining: Math.max(0, entitlement.graceRunsPerDay - graceRuns),
  };
}

export function assertCanBuyCredits(quota: QuotaSnapshot): void {
  if (!quota.canBuyCredits) throw new Error('Credit packs are not available on the Free plan');
}

export function assertCanStartWorkflowRun(quota: QuotaSnapshot): void {
  if (quota.workflowRunsRemaining === null) return;
  if (quota.workflowRunsRemaining <= 0) throw new Error('Daily workflow run quota exceeded');
}

export function clampMinPlanId(requested: unknown, ownerPlan: PlanId): PlanId {
  const wanted = parsePlanId(requested);
  return planRank(wanted) <= planRank(ownerPlan) ? wanted : ownerPlan;
}

export function runnerMeetsMinPlan(runnerPlan: PlanId, minPlanId: unknown): boolean {
  return planRank(runnerPlan) >= planRank(parsePlanId(minPlanId));
}

export type PlanSyncPatch = {
  planId: PlanId;
  planPeriodYm: string;
  planIncludedGrantPlanId?: PlanId;
  workflowRunsToday: number;
  workflowRunsOn: string;
  walletBalance?: number;
  walletCurrency?: 'CR';
  creditLotsJson?: string;
  grantedIncluded: boolean;
  planSource?: string;
  planStatus?: string;
};

function storedIncludedGrantPlanId(user: Record<string, unknown>): string {
  return String(user.planIncludedGrantPlanId ?? user.plan_included_grant_plan_id ?? '').toLowerCase();
}

function liveIncludedGrantSize(user: Record<string, unknown>, now: Date): number {
  const lots = liveLots(parseCreditLots(user.creditLotsJson ?? user.credit_lots_json), now).filter(
    (lot) => lot.source === 'included',
  );
  if (!lots.length) return 0;
  return Math.max(...lots.map((lot) => lot.credits));
}

/**
 * Append this plan's included allotment as a new lot; keep every live lot (included, grace, purchased).
 * Leftover lots keep their own expiry so a mid-cycle upgrade is two blocks, not one merged date.
 */
export function grantIncludedWalletPatch(
  user: Record<string, unknown>,
  planId: PlanId,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): {
  walletBalance: number;
  walletCurrency: 'CR';
  creditLotsJson: string;
  planPeriodYm: string;
  planIncludedGrantPlanId: PlanId;
} {
  const entitlement = entitlementFor(planId, eco);
  const ym = periodYm(now);
  const lots = liveLots(parseCreditLots(user.creditLotsJson ?? user.credit_lots_json), now);
  const nextLots: CreditLot[] =
    entitlement.includedCredits > 0
      ? creditIncludedLots(
          lots,
          entitlement.includedCredits,
          includedGrantExpiresAt(user, now),
          entitlement.includedCogsUsdCap,
          now,
        )
      : lots;
  return {
    planPeriodYm: ym,
    planIncludedGrantPlanId: planId,
    walletBalance: creditBalanceFromLots(nextLots, now),
    walletCurrency: 'CR',
    creditLotsJson: serializeCreditLots(nextLots),
  };
}

/**
 * If a 1-month upgrade already merged leftover + new grant onto UTC month-end, peel the new
 * plan's allotment onto `planCurrentPeriodEnd` and leave the remainder on the original date.
 */
function repairMergedIncludedLots(
  user: Record<string, unknown>,
  planId: PlanId,
  eco: BillingEconomics,
  now: Date,
): CreditLot[] | null {
  const paidEnd = includedGrantExpiresAt(user, now);
  const calendarEnd = periodEndIso(periodYm(now));
  if (!utcDay(paidEnd) || utcDay(paidEnd) === utcDay(calendarEnd)) return null;
  const lots = liveLots(parseCreditLots(user.creditLotsJson ?? user.credit_lots_json), now);
  if (lots.some((lot) => lot.source === 'included' && utcDay(lot.expiresAt ?? '') === utcDay(paidEnd))) {
    return null;
  }
  const entitlement = entitlementFor(planId, eco);
  const calendarDay = utcDay(calendarEnd);
  const calendarRemaining = lots
    .filter((lot) => lot.source === 'included' && utcDay(lot.expiresAt ?? '') === calendarDay)
    .reduce((sum, lot) => sum + lot.remaining, 0);
  const move = roundCredits(Math.min(entitlement.includedCredits, calendarRemaining));
  if (move <= 0) return null;

  let leftToMove = move;
  const next = lots.map((lot) => ({ ...lot }));
  for (let i = next.length - 1; i >= 0 && leftToMove > 0; i--) {
    const lot = next[i];
    if (!lot || lot.source !== 'included' || utcDay(lot.expiresAt ?? '') !== calendarDay) continue;
    const take = Math.min(lot.remaining, leftToMove);
    leftToMove = roundCredits(leftToMove - take);
    lot.remaining = roundCredits(lot.remaining - take);
    lot.credits = roundCredits(lot.credits - take);
  }
  const moved: CreditLot = {
    credits: move,
    remaining: move,
    expiresAt: paidEnd,
    source: 'included',
  };
  if (entitlement.includedCogsUsdCap > 0) moved.includedCogsUsdCap = entitlement.includedCogsUsdCap;
  return [...next.filter((lot) => lot.remaining > 0), moved];
}

function hasIncludedLotOnPaidPeriodEnd(user: Record<string, unknown>, now: Date): boolean {
  const paidDay = utcDay(paidPeriodEndIso(user));
  if (!paidDay) return false;
  return liveLots(parseCreditLots(user.creditLotsJson ?? user.credit_lots_json), now).some(
    (lot) => lot.source === 'included' && utcDay(lot.expiresAt ?? '') === paidDay,
  );
}

function shouldGrantIncludedThisPeriod(
  user: Record<string, unknown>,
  planId: PlanId,
  entitlement: PlanEntitlement,
  storedYm: string,
  ym: string,
  now: Date,
): boolean {
  if (storedYm !== ym) {
    // 1-month grant already follows planCurrentPeriodEnd — do not add another UTC-month lot.
    if (storedIncludedGrantPlanId(user) === planId && hasIncludedLotOnPaidPeriodEnd(user, now)) {
      return false;
    }
    return true;
  }
  const grantPlan = storedIncludedGrantPlanId(user);
  if (grantPlan === planId) return false;
  if (grantPlan && grantPlan !== planId) return entitlement.includedCredits > 0;
  // Legacy rows (no marker): paid upgrade this month still has Free's smaller included lot (or none).
  if (planId === 'free') return false;
  return liveIncludedGrantSize(user, now) < entitlement.includedCredits;
}

/** Roll included credits at month boundary, and on mid-cycle plan upgrades. */
export function syncPlanPeriod(
  user: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): PlanSyncPatch {
  const planId = resolvePlanId(user);
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
  if (planId === 'free' && planSourceOf(user) === 'order') {
    patch.planSource = 'free';
    patch.planStatus = 'none';
  }

  if (!shouldGrantIncludedThisPeriod(user, planId, entitlement, storedYm, ym, now)) {
    if (!storedIncludedGrantPlanId(user) && storedYm === ym) {
      patch.planIncludedGrantPlanId = planId;
    }
    if (storedYm && storedYm !== ym) patch.planPeriodYm = ym;
    const repaired = repairMergedIncludedLots(user, planId, eco, now);
    if (repaired) {
      patch.walletBalance = creditBalanceFromLots(repaired, now);
      patch.walletCurrency = 'CR';
      patch.creditLotsJson = serializeCreditLots(repaired);
    }
    return patch;
  }

  const wallet = grantIncludedWalletPatch(user, planId, eco, now);
  patch.planPeriodYm = wallet.planPeriodYm;
  patch.planIncludedGrantPlanId = wallet.planIncludedGrantPlanId;
  patch.grantedIncluded = entitlement.includedCredits > 0;
  patch.walletBalance = wallet.walletBalance;
  patch.walletCurrency = wallet.walletCurrency;
  patch.creditLotsJson = wallet.creditLotsJson;
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

export function incrementGraceRuns(
  user: Record<string, unknown>,
  now = new Date(),
): { graceRunsToday: number; graceRunsOn: string } {
  const today = todayUtc(now);
  const on = String(user.graceRunsOn ?? user.grace_runs_on ?? '');
  const current = on === today ? Math.max(0, Math.floor(Number(user.graceRunsToday ?? user.grace_runs_today ?? 0) || 0)) : 0;
  return { graceRunsToday: current + 1, graceRunsOn: today };
}

export function parseGraceLastByWorkflow(raw: unknown): Record<string, number> {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) out[k] = n;
        }
        return out;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function graceMonthSpent(user: Record<string, unknown>, now = new Date()): {
  credits: number;
  cogsUsd: number;
} {
  const ym = periodYm(now);
  const stored = String(user.graceMonthYm ?? user.grace_month_ym ?? '');
  if (stored !== ym) return { credits: 0, cogsUsd: 0 };
  return {
    credits: Math.max(0, Number(user.graceCreditsUsedMonth ?? user.grace_credits_used_month ?? 0) || 0),
    cogsUsd: Math.max(0, Number(user.graceCogsUsdMonth ?? user.grace_cogs_usd_month ?? 0) || 0),
  };
}

export type ProductionTriggerKind = 'webhook' | 'cron';

export function isProductionTriggerKind(raw: unknown): raw is ProductionTriggerKind {
  return raw === 'webhook' || raw === 'cron';
}

export function canEnterGrace(params: {
  quota: QuotaSnapshot;
  planStatus?: string;
  triggerKind?: string;
  workflowGrace?: boolean;
  workflowId?: number;
  lastGraceAtMs?: number;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const { quota } = params;
  if (!quota.entitlement.canGraceWhenExhausted) return false;
  if (quota.planRank < 1) return false;
  const status = String(params.planStatus ?? 'active').toLowerCase();
  if (status && status !== 'active' && status !== 'none' && status !== '') return false;
  if (!isProductionTriggerKind(params.triggerKind)) return false;
  if (params.workflowGrace !== true) return false;
  if (quota.graceRunsRemaining <= 0) return false;
  const minInterval = quota.entitlement.graceMinIntervalSec * 1000;
  if (params.workflowId != null && params.lastGraceAtMs != null && minInterval > 0) {
    if (now.getTime() - params.lastGraceAtMs < minInterval) return false;
  }
  return true;
}
