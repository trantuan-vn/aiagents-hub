import type { Context } from 'hono';

import { billingEconomicsFromConfig, type BillingEconomics } from '../../admin/service/credit';
import { getBillingEconomicsFromEnv } from '../../admin/service/get-billing-economics';
import { executeUtils, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  creditBalanceFromLots,
  creditPurchasedLots,
  resolveCreditBalance,
  serializeCreditLots,
} from '../workflows/billing/credit-wallet';

/** Credits granted to the referrer when a referred user opens a new account. */
export const REFERRAL_SIGNUP_CREDITS = 150;

const REWARD_KEYS_MAX_CHARS = 80_000;

export function readReferralRewardKeys(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

export function appendReferralRewardKey(raw: unknown, referredIdentifier: string): string {
  const keys = readReferralRewardKeys(raw);
  if (!keys.includes(referredIdentifier)) keys.push(referredIdentifier);
  while (keys.length > 1 && JSON.stringify(keys).length > REWARD_KEYS_MAX_CHARS) keys.shift();
  return JSON.stringify(keys);
}

export function referralCreditPatch(
  user: Record<string, unknown>,
  credits = REFERRAL_SIGNUP_CREDITS,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  now = new Date(),
): { walletBalance: number; walletCurrency: 'CR'; creditLotsJson: string } {
  const resolved = resolveCreditBalance(user, eco, now);
  const lots = creditPurchasedLots(resolved.lots, credits, eco, now);
  return {
    walletBalance: creditBalanceFromLots(lots, now),
    walletCurrency: 'CR',
    creditLotsJson: serializeCreditLots(lots),
  };
}

export function isReferralRewardPending(user: { referralRewardPending?: unknown } | null | undefined): boolean {
  const value = user?.referralRewardPending;
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * Add signup credits to the referrer once per referred account.
 * Returns true when the reward is recorded (including a previous grant).
 * Returns false when the referrer profile is missing so the caller can retry.
 */
export async function grantReferralSignupCredits(
  c: Context,
  bindingName: string,
  referrerId: string,
  referredIdentifier: string,
): Promise<boolean> {
  if (!referrerId || !referredIdentifier || referrerId === referredIdentifier) return true;

  const referrerDO = getIdFromName(c, referrerId, bindingName) as DurableObjectStub<UserDO>;
  const rows = await executeUtils.executeDynamicAction(referrerDO, 'select', {}, 'users');
  const dbUser = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
  if (!dbUser?.id) return false;

  const claimed = readReferralRewardKeys(dbUser.referralRewardKeys ?? dbUser.referral_reward_keys);
  if (claimed.includes(referredIdentifier)) return true;

  const eco = await getBillingEconomicsFromEnv(c.env);
  const walletPatch = referralCreditPatch(dbUser, REFERRAL_SIGNUP_CREDITS, eco);
  await executeUtils.executeDynamicAction(
    referrerDO,
    'update',
    {
      id: dbUser.id,
      ...walletPatch,
      referralRewardKeys: appendReferralRewardKey(
        dbUser.referralRewardKeys ?? dbUser.referral_reward_keys,
        referredIdentifier,
      ),
      queueStatus: 'pending',
    },
    'users',
  );
  return true;
}
