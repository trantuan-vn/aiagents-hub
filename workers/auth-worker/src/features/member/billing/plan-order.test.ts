import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../admin/service/credit.js';
import { UserSchema } from '../../auth/domain.js';
import {
  encodePlanOrderNotes,
  paidPlanGrantPatch,
  parsePlanOrderIntent,
  planChargeUsd,
} from './plan-order.js';

describe('plan prepaid order', () => {
  it('encodes and parses notes', () => {
    const notes = encodePlanOrderNotes({ planId: 'pro', interval: 6 });
    expect(notes).toBe('plan:pro:6');
    expect(parsePlanOrderIntent({ notes })).toEqual({ kind: 'plan', planId: 'pro', interval: 6 });
    expect(parsePlanOrderIntent({ notes: 'wallet top up' })).toBeNull();
  });

  it('charges the discounted prepaid amount', () => {
    expect(planChargeUsd('starter', 1)).toBe(4.9);
    expect(planChargeUsd('pro', 12)).toBe(191.04);
  });

  it('grants an order-sourced plan until interval months later', () => {
    const patch = paidPlanGrantPatch({ kind: 'plan', planId: 'starter', interval: 3 }, new Date('2026-09-18T00:00:00.000Z'));
    expect(patch.planId).toBe('starter');
    expect(patch.planSource).toBe('order');
    expect(patch.planStatus).toBe('active');
    expect(String(patch.planCurrentPeriodEnd)).toContain('2026-12-18');
  });

  it('UserSchema accepts paidPlanGrantPatch that clears pendingPlanId with null', () => {
    const patch = paidPlanGrantPatch(
      { kind: 'plan', planId: 'starter', interval: 1 },
      new Date('2026-09-18T00:00:00.000Z'),
    );
    const parsed = UserSchema.parse({
      identifier: 'user-1',
      role: 'member',
      pendingPlanId: 'pro',
      ...patch,
    });
    expect(parsed.planId).toBe('starter');
    expect(parsed.pendingPlanId).toBeNull();
  });

  it('credits Starter included CR when granting a prepaid plan', () => {
    const patch = paidPlanGrantPatch(
      { kind: 'plan', planId: 'starter', interval: 1 },
      new Date('2026-09-18T00:00:00.000Z'),
      {
        user: {
          identifier: 'user-1',
          planPeriodYm: '2026-09',
          creditLotsJson: JSON.stringify([
            { credits: 150, remaining: 40, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
          ]),
        },
        eco: billingEconomicsFromConfig(),
      },
    );
    expect(patch.walletBalance).toBe(540);
    expect(patch.walletCurrency).toBe('CR');
    expect(patch.planIncludedGrantPlanId).toBe('starter');
    const lots = JSON.parse(String(patch.creditLotsJson));
    expect(lots).toEqual([
      expect.objectContaining({ credits: 650, remaining: 540, source: 'included' }),
    ]);
  });
});
