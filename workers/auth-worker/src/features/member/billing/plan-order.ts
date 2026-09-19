import type { BillingEconomics } from '../../admin/service/credit';
import {
  addUtcMonths,
  DEFAULT_PLAN_ENTITLEMENTS,
  grantIncludedWalletPatch,
  prepaidUsd,
  type PlanId,
  type PlanInterval,
} from '../workflows/billing/plan';

export { addUtcMonths };

export type PaidPlanId = Exclude<PlanId, 'free'>;

export type PlanOrderIntent = {
  kind: 'plan';
  planId: PaidPlanId;
  interval: PlanInterval;
};

const PLAN_NOTE = /^plan:(starter|pro|business):(1|3|6|12)$/;

export function encodePlanOrderNotes(intent: Pick<PlanOrderIntent, 'planId' | 'interval'>): string {
  return `plan:${intent.planId}:${intent.interval}`;
}

export function parsePlanOrderIntent(order: { notes?: unknown; internalNotes?: unknown; internal_notes?: unknown }): PlanOrderIntent | null {
  for (const raw of [order.notes, order.internalNotes, order.internal_notes]) {
    const m = PLAN_NOTE.exec(String(raw ?? '').trim());
    if (m) {
      return {
        kind: 'plan',
        planId: m[1] as PaidPlanId,
        interval: Number(m[2]) as PlanInterval,
      };
    }
  }
  return null;
}

function openOrderStatus(raw: unknown): boolean {
  const status = String(raw ?? '').toUpperCase();
  return status === 'PENDING' || status === 'CONFIRMED';
}

/** Open prepaid plan orders already paid by an Active PayPal Subscribe of the same plan + interval. */
export function openPlanOrderIdsCoveredBySubscribe(
  orders: Array<Record<string, unknown>>,
  planId: PlanId,
  interval: PlanInterval,
): number[] {
  if (planId === 'free') return [];
  const ids: number[] = [];
  for (const order of orders) {
    if (!openOrderStatus(order.status)) continue;
    const intent = parsePlanOrderIntent(order);
    if (!intent || intent.planId !== planId || intent.interval !== interval) continue;
    const id = Number(order.id);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids;
}

export function planChargeUsd(planId: PaidPlanId, interval: PlanInterval): number {
  return prepaidUsd(DEFAULT_PLAN_ENTITLEMENTS[planId].listPriceUsdPerMonth, interval);
}

export function paidPlanGrantPatch(
  intent: PlanOrderIntent,
  now = new Date(),
  opts?: { user: Record<string, unknown>; eco: BillingEconomics },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    planId: intent.planId,
    planSource: 'order',
    planInterval: intent.interval,
    planStatus: 'active',
    planCurrentPeriodEnd: addUtcMonths(now, intent.interval).toISOString(),
    cancelAtPeriodEnd: true,
    pendingPlanId: null,
  };
  if (!opts?.user) return base;
  return {
    ...base,
    ...grantIncludedWalletPatch({ ...opts.user, ...base }, intent.planId, opts.eco, now),
  };
}
