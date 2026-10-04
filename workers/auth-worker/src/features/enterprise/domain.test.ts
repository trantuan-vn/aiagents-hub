import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../admin/service/credit.js';
import {
  assertCanPrepay,
  deriveEnterpriseState,
  encodeEnterpriseOrderNotes,
  enterpriseSeatPatch,
  isActiveSeat,
  isEnterpriseManaged,
  meetsSeatThreshold,
  nextPeriodEnd,
  parseEnterpriseInvoiceId,
  priceRoster,
  prorateSeatUsd,
  seatAlreadyCovers,
} from './domain.js';
import { isReservedOrderNote, parseCreateOrderRequest } from '../member/order/domain.js';

const eco = billingEconomicsFromConfig();
const prices = { business: 99.9, pro: 19.9 };

describe('enterprise state', () => {
  it('stays pending until a period is paid', () => {
    expect(deriveEnterpriseState({ period_end: null, admin_hold: 0 }, new Date())).toEqual({ status: 'pending', seatGraceUntil: null });
  });

  it('keeps active through 7 days of grace, then suspends', () => {
    const org = { period_end: '2026-10-01T00:00:00.000Z', admin_hold: 0 };
    expect(deriveEnterpriseState(org, new Date('2026-09-30T00:00:00.000Z'))).toEqual({ status: 'active', seatGraceUntil: null });
    expect(deriveEnterpriseState(org, new Date('2026-10-03T00:00:00.000Z'))).toEqual({
      status: 'active',
      seatGraceUntil: '2026-10-08T00:00:00.000Z',
    });
    expect(deriveEnterpriseState(org, new Date('2026-10-08T00:00:00.000Z')).status).toBe('suspended');
  });

  it('suspends on admin hold and reopens when the hold lifts inside the period', () => {
    const now = new Date('2026-09-15T00:00:00.000Z');
    expect(deriveEnterpriseState({ period_end: '2026-10-01T00:00:00.000Z', admin_hold: 1 }, now).status).toBe('suspended');
    expect(deriveEnterpriseState({ period_end: '2026-10-01T00:00:00.000Z', admin_hold: 0 }, now).status).toBe('active');
  });
});

describe('enterprise invoice pricing', () => {
  const members = [
    { userId: 'boss@x', seatRole: 'business' as const, user: { planSource: 'free' } },
    { userId: 'a@x', seatRole: 'pro' as const, user: { planSource: 'enterprise', planStatus: 'active' } },
    { userId: 'b@x', seatRole: 'pro' as const, user: { planSource: 'paypal', planStatus: 'active' } },
    { userId: 'c@x', seatRole: 'pro' as const, user: { planSource: 'admin', planId: 'pro' } },
  ];

  it('charges only seats that are not self-paid or admin-granted', () => {
    const priced = priceRoster(members, prices, 1);
    expect(priced.roster.map((s) => s.userId)).toEqual(['boss@x', 'a@x']);
    expect(priced.excluded.map((s) => s.reason)).toEqual(['self_paid', 'admin_granted']);
    expect(priced.amountUsd).toBe(119.8);
    expect(meetsSeatThreshold(priced, 1)).toBe(true);
    expect(meetsSeatThreshold(priced, 2)).toBe(false);
  });

  it('applies the interval discount per seat', () => {
    expect(priceRoster(members, prices, 12).amountUsd).toBe(Math.round((959.04 + 191.04) * 100) / 100);
  });

  it('allows at most one period queued ahead', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(() => assertCanPrepay('2026-10-20T00:00:00.000Z', 1, now)).not.toThrow();
    expect(() => assertCanPrepay('2026-12-20T00:00:00.000Z', 1, now)).toThrow('ALREADY_PREPAID');
  });

  it('chains a new period from the current end, or from now once it has lapsed', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(nextPeriodEnd('2026-10-20T00:00:00.000Z', 3, now).end.toISOString()).toBe('2027-01-20T00:00:00.000Z');
    expect(nextPeriodEnd('2026-09-01T00:00:00.000Z', 1, now).end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('prorates a mid-period seat and includes a prepaid extra period', () => {
    const now = new Date('2026-10-16T00:00:00.000Z');
    const half = prorateSeatUsd(19.9, 1, now, new Date('2026-11-01T00:00:00.000Z'));
    expect(half).toBeGreaterThan(9);
    expect(half).toBeLessThan(11);
    expect(prorateSeatUsd(19.9, 1, now, new Date('2026-12-01T00:00:00.000Z'))).toBeCloseTo(half + 19.9, 1);
  });
});

describe('enterprise seats', () => {
  const now = new Date('2026-10-05T00:00:00.000Z');

  it('writes the organization plan and grants included credits once per month', () => {
    const fresh = enterpriseSeatPatch({ planSource: 'free' }, 'pro', '2026-11-05T00:00:00.000Z', 1, eco, now);
    expect(fresh).toMatchObject({ planId: 'pro', planSource: 'enterprise', planStatus: 'active', planCurrentPeriodEnd: '2026-11-05T00:00:00.000Z' });
    expect(fresh.planIncludedGrantPlanId).toBe('pro');

    const renewed = enterpriseSeatPatch(
      { planSource: 'enterprise', planPeriodYm: '2026-10', planIncludedGrantPlanId: 'pro' },
      'pro',
      '2026-12-05T00:00:00.000Z',
      1,
      eco,
      now,
    );
    expect(renewed.walletBalance).toBeUndefined();
  });

  it('does not move a seat period backwards on a retried capture', () => {
    const user = { planSource: 'enterprise', planCurrentPeriodEnd: '2026-12-05T00:00:00.000Z' };
    expect(seatAlreadyCovers(user, '2026-11-05T00:00:00.000Z')).toBe(true);
    expect(seatAlreadyCovers(user, '2027-01-05T00:00:00.000Z')).toBe(false);
  });

  it('counts a seat as active only when the plan comes from the organization or an admin', () => {
    const seat = { planId: 'pro', planSource: 'enterprise', planStatus: 'active', planCurrentPeriodEnd: '2026-11-05T00:00:00.000Z' };
    expect(isActiveSeat(seat, 'pro', now)).toBe(true);
    expect(isActiveSeat(seat, 'business', now)).toBe(false);
    expect(isActiveSeat({ ...seat, planSource: 'paypal' }, 'pro', now)).toBe(false);
    expect(isEnterpriseManaged(seat, now)).toBe(true);
    expect(isEnterpriseManaged({ ...seat, planCurrentPeriodEnd: '2026-09-01T00:00:00.000Z' }, now)).toBe(false);
  });
});

describe('order notes', () => {
  it('round-trips the invoice id on the order', () => {
    const id = '2f0c7a7e-4c8b-4a55-9a4f-1b2c3d4e5f60';
    expect(parseEnterpriseInvoiceId({ notes: encodeEnterpriseOrderNotes(id) })).toBe(id);
    expect(parseEnterpriseInvoiceId({ notes: 'enterprise:nope' })).toBeNull();
  });

  it('drops reserved notes a member sends on a wallet top-up', () => {
    expect(isReservedOrderNote('plan:business:12')).toBe(true);
    expect(isReservedOrderNote(' Enterprise:abc')).toBe(true);
    expect(parseCreateOrderRequest({ amount: 1, currency: 'USD', notes: 'plan:business:12' }, 1).notes).toBeUndefined();
    expect(parseCreateOrderRequest({ amount: 1, currency: 'USD', notes: 'gift for team' }, 1).notes).toBe('gift for team');
    expect(parseCreateOrderRequest({ amount: 1, planId: 'pro', interval: 3, notes: 'enterprise:x' }, 1).notes).toBe('plan:pro:3');
  });
});
