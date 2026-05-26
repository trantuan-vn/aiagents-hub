import { Context } from 'hono';
import { convertVndToUsd, roundUsdAmount } from '../../admin/service/pricing';
import type { MembershipTier } from '../../admin/membership-tier/domain';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { executeUtils, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createCommissionPolicyInfrastructure } from './commission-policy-infrastructure';
import { createCommissionInfrastructure } from './commission-infrastructure';
import { getPrimaryAdminIdentifier } from '../../admin/admin-identifier';

async function getReferrerMembershipTier(
  c: Context,
  bindingName: string,
  referrerId: string,
): Promise<MembershipTier> {
  const referrerDO = getIdFromName(c, referrerId, bindingName) as DurableObjectStub<UserDO>;
  const rows = await executeUtils.executeDynamicAction(referrerDO, 'select', {}, 'users');
  const dbUser = rows[0] as Record<string, unknown> | undefined;
  const tier = dbUser?.membershipTier ?? dbUser?.membership_tier ?? 'member';
  return String(tier) as MembershipTier;
}

function policyMembershipTiers(policy: Record<string, unknown>): string[] {
  const tiers = policy.membershipTiers ?? policy.membership_tiers;
  return Array.isArray(tiers) ? tiers.map(String) : [];
}

export async function processCommissionOnOrder(
  c: Context,
  bindingName: string,
  user: { identifier: string; referrerId?: string; id?: number },
  orderRecord: { id: number; orderCode: string; finalAmount: number; currency: string }
): Promise<void> {
  if (!user.referrerId) return;
  const adminDO = getIdFromName(c, getPrimaryAdminIdentifier(c.env), bindingName) as DurableObjectStub<UserDO>;
  const policyInfra = createCommissionPolicyInfrastructure(adminDO);

  const policies = await policyInfra.list(50, 0, 'ACTIVE');
  const now = new Date();
  const referrerTier = await getReferrerMembershipTier(c, bindingName, user.referrerId);

  const applicable = policies.find((p: Record<string, unknown>) => {
    if (p.status !== 'ACTIVE') return false;
    const from = new Date(String(p.effectiveFrom));
    const to = new Date(String(p.effectiveTo));
    if (now < from || now > to) return false;
    if (p.applicableTo === 'ALL') return true;
    if (p.applicableTo === 'SPECIFIC' && Array.isArray(p.targetIds) && p.targetIds.includes(user.referrerId)) {
      return true;
    }
    if (p.applicableTo === 'USER_GROUP') {
      const tiers = policyMembershipTiers(p);
      return tiers.length > 0 && tiers.includes(referrerTier);
    }
    return false;
  });
  
  if (!applicable) return;
  const percent = applicable.commissionPercent ?? 0;
  if (percent <= 0) return;
  const usdVndRate = await getUsdVndRateFromEnv(c.env, bindingName);
  const orderAmountUsd =
    (orderRecord.currency ?? 'USD').toUpperCase() === 'USD'
      ? orderRecord.finalAmount
      : convertVndToUsd(orderRecord.finalAmount, usdVndRate);
  const commissionAmount = roundUsdAmount((orderAmountUsd * percent) / 100);

  const referrerDO = getIdFromName(c, user.referrerId, bindingName) as DurableObjectStub<UserDO>;
  const commissionInfra = createCommissionInfrastructure(referrerDO);
  await commissionInfra.recordCommission({
    orderId: orderRecord.id,
    orderCode: orderRecord.orderCode,
    referrerId: user.referrerId,
    referredUserId: user.identifier,
    orderAmount: orderAmountUsd,
    commissionPercent: percent,
    commissionAmount,
    currency: 'USD',
    policyId: applicable.id,
    queueStatus: 'pending',
  });
}
