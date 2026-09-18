import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../../admin/service/credit.js';
import {
  applyWalletCreditDebit,
  applyWalletCreditTopUp,
  creditIncludedLots,
  debitCreditLots,
  resolveCreditBalance,
} from './credit-wallet.js';

const eco = billingEconomicsFromConfig();

describe('credit lots FIFO', () => {
  it('lazy-converts a USD wallet into a purchased lot', () => {
    const resolved = resolveCreditBalance({ walletBalance: 7.7 }, eco);
    expect(resolved.migrated).toBe(true);
    expect(resolved.credits).toBe(1000);
    expect(resolved.lots[0]?.source).toBe('purchased');
  });

  it('debits the earliest-expiring lot first', () => {
    const { lots, remainingToDebit } = debitCreditLots(
      [
        { credits: 10, remaining: 10, expiresAt: '2028-01-02T00:00:00.000Z', source: 'purchased' },
        { credits: 5, remaining: 5, expiresAt: '2027-01-01T00:00:00.000Z', source: 'purchased' },
      ],
      6,
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(remainingToDebit).toBe(0);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.remaining).toBe(9);
    expect(lots[0]?.expiresAt).toBe('2028-01-02T00:00:00.000Z');
  });

  it('skips expired lots', () => {
    const resolved = resolveCreditBalance(
      {
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 8, remaining: 8, expiresAt: '2020-01-01T00:00:00.000Z', source: 'purchased' },
          { credits: 3, remaining: 3, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' },
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

  it('allows credit pack top-up on a PayPal Starter plan', () => {
    const added = applyWalletCreditTopUp(
      { planId: 'starter', planSource: 'paypal', paypalSubscriptionId: 'I-1', walletBalance: 0, walletCurrency: 'CR' },
      20,
      eco,
    );
    expect(added.walletBalance).toBe(20);
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
