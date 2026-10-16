import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../admin/service/credit';
import {
  appendReferralRewardKey,
  readReferralRewardKeys,
  referralCreditPatch,
  REFERRAL_SIGNUP_CREDITS,
} from './signup-reward';

const eco = billingEconomicsFromConfig();

describe('referral signup credits', () => {
  it('adds 150 purchased credits to an empty wallet', () => {
    const patch = referralCreditPatch({ walletBalance: 0, walletCurrency: 'CR' }, REFERRAL_SIGNUP_CREDITS, eco);
    expect(patch.walletBalance).toBe(150);
    expect(patch.walletCurrency).toBe('CR');
    const lots = JSON.parse(patch.creditLotsJson) as Array<{ source: string; remaining: number; expiresAt?: string }>;
    expect(lots).toEqual([expect.objectContaining({ source: 'purchased', remaining: 150 })]);
    expect(lots[0]?.expiresAt).toBeUndefined();
  });

  it('adds 150 credits on top of an existing purchased balance', () => {
    const patch = referralCreditPatch(
      {
        walletBalance: 10,
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([{ credits: 10, remaining: 10, source: 'purchased' }]),
      },
      REFERRAL_SIGNUP_CREDITS,
      eco,
    );
    expect(patch.walletBalance).toBe(160);
  });

  it('records each referred account once', () => {
    const first = appendReferralRewardKey(undefined, 'new@example.com');
    const second = appendReferralRewardKey(first, 'new@example.com');
    expect(readReferralRewardKeys(second)).toEqual(['new@example.com']);
    expect(readReferralRewardKeys(appendReferralRewardKey(second, 'other@example.com'))).toEqual([
      'new@example.com',
      'other@example.com',
    ]);
  });
});
