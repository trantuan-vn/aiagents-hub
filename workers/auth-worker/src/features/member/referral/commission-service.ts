/**
 * Cash referral commission is retired.
 * A new account opened with a referral code grants the referrer 150 CR
 * (see signup-reward.ts). Orders no longer accrue a cash commission.
 */
export async function processCommissionOnOrder(): Promise<void> {
  return;
}
