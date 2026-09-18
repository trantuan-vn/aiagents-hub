import { DEFAULT_PLAN_ENTITLEMENTS, prepaidUsd, type PlanId, type PlanInterval } from '../workflows/billing/plan';

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

export function planChargeUsd(planId: PaidPlanId, interval: PlanInterval): number {
  return prepaidUsd(DEFAULT_PLAN_ENTITLEMENTS[planId].listPriceUsdPerMonth, interval);
}

export function addUtcMonths(from: Date, months: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}

export function paidPlanGrantPatch(intent: PlanOrderIntent, now = new Date()): Record<string, unknown> {
  return {
    planId: intent.planId,
    planSource: 'order',
    planInterval: intent.interval,
    planStatus: 'active',
    planCurrentPeriodEnd: addUtcMonths(now, intent.interval).toISOString(),
    cancelAtPeriodEnd: true,
    pendingPlanId: null,
  };
}
