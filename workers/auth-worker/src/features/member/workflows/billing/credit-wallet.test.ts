import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../../admin/service/credit.js';
import {
  applyWalletCreditDebit,
  applyWalletCreditTopUp,
  coalesceCreditLots,
  creditIncludedLots,
  debitCreditLots,
  expireCreditLots,
  resolveCreditBalance,
  sweepExpiredWalletPatch,
} from './credit-wallet.js';

const eco = billingEconomicsFromConfig();

describe('credit lots FIFO', () => {
  it('lazy-converts a USD wallet into a purchased lot', () => {
    const resolved = resolveCreditBalance({ walletBalance: 7.7 }, eco);
    expect(resolved.migrated).toBe(true);
    expect(resolved.credits).toBe(1000);
    expect(resolved.lots[0]?.source).toBe('purchased');
    expect(resolved.lots[0]?.expiresAt).toBeUndefined();
  });

  it('debits expiring plan lots before never-expiring top-up lots', () => {
    const { lots, remainingToDebit } = debitCreditLots(
      [
        { credits: 10, remaining: 10, source: 'purchased' },
        { credits: 5, remaining: 5, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
      ],
      6,
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(remainingToDebit).toBe(0);
    expect(lots).toEqual([expect.objectContaining({ source: 'purchased', remaining: 9 })]);
  });

  it('merges lots that share a source and expiry day', () => {
    const merged = coalesceCreditLots([
      { credits: 500, remaining: 500, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
      { credits: 2000, remaining: 2000, expiresAt: '2026-10-01T12:00:00.000Z', source: 'included' },
      { credits: 259.74, remaining: 259.74, source: 'purchased' },
      { credits: 649.35, remaining: 649.35, source: 'purchased' },
    ]);
    expect(merged).toEqual([
      expect.objectContaining({ source: 'included', remaining: 2500, credits: 2500 }),
      expect.objectContaining({ source: 'purchased', remaining: 909.09 }),
    ]);
  });

  it('does not merge included lots that expire on different days', () => {
    expect(
      coalesceCreditLots([
        { credits: 500, remaining: 500, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
        { credits: 2000, remaining: 2000, expiresAt: '2026-11-01T00:00:00.000Z', source: 'included' },
      ]),
    ).toHaveLength(2);
  });

  it('zeros expired lots and keeps live blocks', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    const { lots, expired } = expireCreditLots(
      [
        { credits: 150, remaining: 80, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
        { credits: 500, remaining: 500, expiresAt: '2026-11-01T00:00:00.000Z', source: 'included' },
        { credits: 10, remaining: 10, expiresAt: '2020-01-01T00:00:00.000Z', source: 'purchased' },
      ],
      now,
    );
    expect(expired).toEqual([expect.objectContaining({ remaining: 0, credits: 150, source: 'included' })]);
    expect(lots.map((lot) => lot.remaining).sort((a, b) => a - b)).toEqual([10, 500]);
    expect(lots.find((lot) => lot.source === 'purchased')?.remaining).toBe(10);
  });

  it('persists a wallet patch that drops expired blocks only', () => {
    const patch = sweepExpiredWalletPatch(
      {
        walletBalance: 90,
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 80, remaining: 80, expiresAt: '2020-01-01T00:00:00.000Z', source: 'included' },
          { credits: 10, remaining: 10, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' },
        ]),
      },
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(patch?.walletBalance).toBe(10);
    expect(JSON.parse(String(patch?.creditLotsJson))).toEqual([
      expect.objectContaining({ remaining: 10, source: 'purchased' }),
    ]);
    expect(
      sweepExpiredWalletPatch(
        {
          walletCurrency: 'CR',
          creditLotsJson: JSON.stringify([
            { credits: 10, remaining: 10, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' },
          ]),
        },
        new Date('2026-09-16T00:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('never expires purchased top-up lots, even if a stale expiresAt is stored', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const resolved = resolveCreditBalance(
      {
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 8, remaining: 8, expiresAt: '2020-01-01T00:00:00.000Z', source: 'purchased' },
          { credits: 3, remaining: 3, expiresAt: '2026-10-01T00:00:00.000Z', source: 'included' },
        ]),
      },
      eco,
      now,
    );
    expect(resolved.credits).toBe(11);
    const { expired, lots } = expireCreditLots(resolved.lots, new Date('2026-10-01T00:00:00.000Z'));
    expect(expired).toEqual([expect.objectContaining({ source: 'included', remaining: 0 })]);
    expect(lots).toEqual([expect.objectContaining({ source: 'purchased', remaining: 8 })]);
  });

  it('skips expired plan lots', () => {
    const resolved = resolveCreditBalance(
      {
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 8, remaining: 8, expiresAt: '2020-01-01T00:00:00.000Z', source: 'included' },
          { credits: 3, remaining: 3, source: 'purchased' },
        ]),
      },
      eco,
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(resolved.credits).toBe(3);
  });

  it('top-up then debit updates walletBalance as remaining lots', () => {
    const added = applyWalletCreditTopUp({ planId: 'pro', planSource: 'paypal', paypalSubscriptionId: 'I-1', walletBalance: 0, walletCurrency: 'CR' }, 20, eco);
    const after = applyWalletCreditDebit(added, 7.5, eco);
    expect(after.walletCurrency).toBe('CR');
    expect(after.walletBalance).toBe(12.5);
  });

  it('blocks credit pack top-up on the Free plan', () => {
    expect(() => applyWalletCreditTopUp({ planId: 'free', walletBalance: 0, walletCurrency: 'CR' }, 20, eco)).toThrow(
      /Free plan/,
    );
  });

  it('blocks credit pack top-up until a PayPal Subscribe is active', () => {
    expect(() =>
      applyWalletCreditTopUp(
        {
          planId: 'business',
          planSource: 'paypal',
          planStatus: 'approval_pending',
          paypalSubscriptionId: 'I-PENDING',
          walletBalance: 0,
          walletCurrency: 'CR',
        },
        20,
        eco,
      ),
    ).toThrow(/Free plan/);
  });

  it('allows credit pack top-up on a PayPal Starter plan', () => {
    const added = applyWalletCreditTopUp(
      { planId: 'starter', planSource: 'paypal', paypalSubscriptionId: 'I-1', walletBalance: 0, walletCurrency: 'CR' },
      20,
      eco,
    );
    expect(added.walletBalance).toBe(20);
    const lots = JSON.parse(String(added.creditLotsJson)) as Array<{ source: string; expiresAt?: string }>;
    expect(lots).toEqual([expect.objectContaining({ source: 'purchased', remaining: 20 })]);
    expect(lots[0]?.expiresAt).toBeUndefined();
  });

  it('skips included lots when the COGS cap is exhausted', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const lots = creditIncludedLots(
      [{ credits: 50, remaining: 50, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' }],
      20,
      '2026-10-01T00:00:00.000Z',
      0.01,
      now,
    );
    const { lots: next, remainingToDebit } = debitCreditLots(lots, 5, now, { cogsAiUsd: 0.5 });
    expect(remainingToDebit).toBe(0);
    const included = next.find((l) => l.source === 'included');
    const purchased = next.find((l) => l.source === 'purchased');
    expect(included?.remaining).toBe(20);
    expect(purchased?.remaining).toBe(45);
  });
});
