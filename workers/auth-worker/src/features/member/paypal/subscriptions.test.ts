import { describe, expect, it } from 'vitest';

import { paypalBillingPlanMatrix } from '../workflows/billing/catalog';
import {
  mapPaypalStatus,
  paypalSubscriptionStubFromWebhook,
  shouldCreatePaypalSubscription,
  subscriptionEntitlementPatch,
} from './subscriptions';

describe('paypal subscription helpers', () => {
  it('maps PayPal statuses used by Subscribe webhooks', () => {
    expect(mapPaypalStatus('ACTIVE')).toBe('active');
    expect(mapPaypalStatus('APPROVED')).toBe('active');
    expect(mapPaypalStatus('APPROVAL_PENDING')).toBe('approval_pending');
    expect(mapPaypalStatus('SUSPENDED')).toBe('suspended');
    expect(mapPaypalStatus('CANCELLED')).toBe('canceled');
    expect(mapPaypalStatus('COMPLETED')).toBe('none');
  });

  it('reads the billing agreement id from a sale webhook', () => {
    expect(
      paypalSubscriptionStubFromWebhook('PAYMENT.SALE.COMPLETED', {
        id: 'sale-1',
        billing_agreement_id: 'I-SUB123',
      }),
    ).toEqual({ id: 'I-SUB123' });
    expect(
      paypalSubscriptionStubFromWebhook('BILLING.SUBSCRIPTION.ACTIVATED', {
        id: 'I-SUB123',
        plan_id: 'P-1',
        status: 'ACTIVE',
      }),
    ).toMatchObject({ id: 'I-SUB123', plan_id: 'P-1' });
  });

  it('creates a PayPal Subscribe checkout only when method is subscription', () => {
    expect(
      shouldCreatePaypalSubscription({ method: 'subscription', billingEnabled: true, paypalPlanId: 'P-1' }),
    ).toBe(true);
    expect(
      shouldCreatePaypalSubscription({ method: undefined, billingEnabled: true, paypalPlanId: 'P-1' }),
    ).toBe(false);
    expect(
      shouldCreatePaypalSubscription({ method: 'order', billingEnabled: true, paypalPlanId: 'P-1' }),
    ).toBe(false);
    expect(
      shouldCreatePaypalSubscription({ method: 'subscription', billingEnabled: true, paypalPlanId: '' }),
    ).toBe(false);
  });

  it('does not grant a plan until the PayPal subscription is active', () => {
    expect(
      subscriptionEntitlementPatch({
        mapped: { planId: 'business', interval: 1 },
        status: 'approval_pending',
      }),
    ).toEqual({ planStatus: 'approval_pending' });
    expect(
      subscriptionEntitlementPatch({
        mapped: { planId: 'business', interval: 1 },
        status: 'active',
        nextBillingTime: '2026-10-19T00:00:00.000Z',
      }),
    ).toMatchObject({
      planId: 'business',
      planSource: 'paypal',
      planStatus: 'active',
      cancelAtPeriodEnd: false,
      planCurrentPeriodEnd: '2026-10-19T00:00:00.000Z',
    });
    expect(
      subscriptionEntitlementPatch({
        mapped: { planId: 'business', interval: 1 },
        status: 'canceled',
        now: new Date('2026-09-19T00:00:00.000Z'),
      }),
    ).toMatchObject({ planId: 'free', planSource: 'free', planStatus: 'canceled' });
  });

  it('charges the prepaid matrix amounts on PayPal Billing Plans', () => {
    const byKey = Object.fromEntries(paypalBillingPlanMatrix().map((row) => [row.envKey, row.chargeUsd]));
    expect(byKey.PAYPAL_PLAN_STARTER_1).toBe(4.9);
    expect(byKey.PAYPAL_PLAN_STARTER_3).toBe(13.23);
    expect(byKey.PAYPAL_PLAN_PRO_1).toBe(19.9);
    expect(byKey.PAYPAL_PLAN_BUSINESS_12).toBe(959.04);
  });
});
