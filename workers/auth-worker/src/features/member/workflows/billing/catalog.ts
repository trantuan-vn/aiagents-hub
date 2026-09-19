import {
  DEFAULT_PLAN_ENTITLEMENTS,
  INTERVAL_DISCOUNT,
  PLAN_IDS,
  PLAN_INTERVALS,
  effectiveUsdPerMonth,
  prepaidUsd,
  type PlanId,
  type PlanInterval,
} from './plan.js';

/** Opt-out for PayPal Subscriptions (Visa/Mastercard auto-renew) only. The four plans stay buyable via Casso / PayPal Orders even when this is `"false"`. */
export function isPaypalBillingEnabled(env?: { PAYPAL_BILLING_ENABLED?: string }): boolean {
  const flag = env?.PAYPAL_BILLING_ENABLED ?? process.env.PAYPAL_BILLING_ENABLED;
  const s = String(flag ?? 'true').toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'off';
}

export const PAYPAL_PLAN_ENV_KEYS: Record<Exclude<PlanId, 'free'>, Record<PlanInterval, string>> = {
  starter: {
    1: 'PAYPAL_PLAN_STARTER_1',
    3: 'PAYPAL_PLAN_STARTER_3',
    6: 'PAYPAL_PLAN_STARTER_6',
    12: 'PAYPAL_PLAN_STARTER_12',
  },
  pro: {
    1: 'PAYPAL_PLAN_PRO_1',
    3: 'PAYPAL_PLAN_PRO_3',
    6: 'PAYPAL_PLAN_PRO_6',
    12: 'PAYPAL_PLAN_PRO_12',
  },
  business: {
    1: 'PAYPAL_PLAN_BUSINESS_1',
    3: 'PAYPAL_PLAN_BUSINESS_3',
    6: 'PAYPAL_PLAN_BUSINESS_6',
    12: 'PAYPAL_PLAN_BUSINESS_12',
  },
};

export type PaypalBillingPlanSpec = {
  envKey: string;
  planId: Exclude<PlanId, 'free'>;
  interval: PlanInterval;
  chargeUsd: number;
  name: string;
};

export function paypalBillingPlanMatrix(): PaypalBillingPlanSpec[] {
  const paid = ['starter', 'pro', 'business'] as const;
  const out: PaypalBillingPlanSpec[] = [];
  for (const planId of paid) {
    for (const interval of PLAN_INTERVALS) {
      out.push({
        envKey: PAYPAL_PLAN_ENV_KEYS[planId][interval],
        planId,
        interval,
        chargeUsd: prepaidUsd(DEFAULT_PLAN_ENTITLEMENTS[planId].listPriceUsdPerMonth, interval),
        name: `AI Agents Hub ${planId} ${interval}mo`,
      });
    }
  }
  return out;
}

function envString(env: Record<string, unknown> | undefined, key: string): string {
  const fromEnv = env?.[key];
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  const fromProcess = process.env[key];
  return typeof fromProcess === 'string' && fromProcess.trim() ? fromProcess.trim() : '';
}

export function paypalPlanIdFor(
  planId: Exclude<PlanId, 'free'>,
  interval: PlanInterval,
  env?: Record<string, unknown>,
): string {
  return envString(env, PAYPAL_PLAN_ENV_KEYS[planId][interval]);
}

export function mapPaypalPlanId(
  paypalPlanId: string,
  env?: Record<string, unknown>,
): { planId: Exclude<PlanId, 'free'>; interval: PlanInterval } | null {
  const wanted = paypalPlanId.trim();
  if (!wanted) return null;
  for (const planId of ['starter', 'pro', 'business'] as const) {
    for (const interval of PLAN_INTERVALS) {
      if (paypalPlanIdFor(planId, interval, env) === wanted) return { planId, interval };
    }
  }
  return null;
}

export function publicPlansCatalog(env?: Record<string, unknown> & { PAYPAL_BILLING_ENABLED?: string }) {
  const billingEnabled = isPaypalBillingEnabled(env);
  return {
    billingEnabled,
    gateway: 'paypal' as const,
    creditPriceUsd: 0.0077,
    intervals: [...PLAN_INTERVALS],
    discounts: { ...INTERVAL_DISCOUNT },
    plans: PLAN_IDS.map((planId) => {
      const e = DEFAULT_PLAN_ENTITLEMENTS[planId];
      const prices =
        planId === 'free'
          ? { '1': null, '3': null, '6': null, '12': null }
          : Object.fromEntries(
              PLAN_INTERVALS.map((interval) => [
                String(interval),
                {
                  chargeUsd: prepaidUsd(e.listPriceUsdPerMonth, interval),
                  usdPerMonth: effectiveUsdPerMonth(e.listPriceUsdPerMonth, interval),
                },
              ]),
            );
      return {
        planId,
        listPriceUsdPerMonth: e.listPriceUsdPerMonth,
        prices,
        includedCredits: e.includedCredits,
        includedCogsUsdCap: e.includedCogsUsdCap,
        workflowRunsPerDay: e.workflowRunsPerDay,
        maxCronJobs: e.maxCronJobs,
        canBuyCredits: e.canBuyCredits,
        canShareWorkflows: e.canShareWorkflows,
        canUseWebhooks: e.canUseWebhooks,
        canUseCron: e.canUseCron,
        canGraceWhenExhausted: e.canGraceWhenExhausted,
        showModelFamily: e.showModelFamily,
        popular: planId === 'pro',
      };
    }),
  };
}
