import { describe, expect, it } from 'vitest';

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
});
