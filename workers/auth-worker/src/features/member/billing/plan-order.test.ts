import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../admin/service/credit.js';
import { UserSchema } from '../../auth/domain.js';
import {
  encodePlanOrderNotes,
  openPlanOrderIdsCoveredBySubscribe,
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

  it('closes open prepaid plan orders that match an Active PayPal Subscribe', () => {
    expect(
      openPlanOrderIdsCoveredBySubscribe(
        [
          { id: 11, status: 'PENDING', notes: 'plan:starter:1' },
          { id: 12, status: 'COMPLETED', notes: 'plan:starter:1' },
          { id: 13, status: 'PENDING', notes: 'plan:pro:1' },
          { id: 14, status: 'CONFIRMED', notes: 'plan:starter:1' },
          { id: 15, status: 'PENDING', notes: 'plan:starter:12' },
        ],
        'starter',
        1,
      ),
    ).toEqual([11, 14]);
    expect(openPlanOrderIdsCoveredBySubscribe([{ id: 11, status: 'PENDING', notes: 'plan:starter:1' }], 'free', 1)).toEqual(
      [],
    );
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

  it('credits Starter included CR as a separate lot until the paid period end', () => {
    const now = new Date('2026-09-19T00:00:00.000Z');
    const patch = paidPlanGrantPatch(
      { kind: 'plan', planId: 'starter', interval: 1 },
      now,
      {
        user: {
          identifier: 'user-1',
          planPeriodYm: '2026-09',
          creditLotsJson: JSON.stringify([
            { credits: 200, remaining: 200, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
          ]),
        },
        eco: billingEconomicsFromConfig(),
      },
    );
    expect(patch.walletBalance).toBe(700);
    expect(patch.walletCurrency).toBe('CR');
    expect(patch.planIncludedGrantPlanId).toBe('starter');
    expect(String(patch.planCurrentPeriodEnd)).toContain('2026-10-19');
    const lots = JSON.parse(String(patch.creditLotsJson)) as Array<{
      remaining: number;
      credits: number;
      source: string;
      expiresAt?: string;
    }>;
    expect(lots).toEqual([
      expect.objectContaining({ remaining: 200, credits: 200, source: 'included', expiresAt: '2026-10-01T00:00:00.000Z' }),
      expect.objectContaining({ remaining: 500, credits: 500, source: 'included', expiresAt: String(patch.planCurrentPeriodEnd) }),
    ]);
  });
});
