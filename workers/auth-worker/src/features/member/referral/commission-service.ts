import { Context } from 'hono';
import { convertVndToUsd, roundUsdAmount } from '../../admin/service/pricing';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createCommissionPolicyInfrastructure } from './commission-policy-infrastructure';
import { createCommissionInfrastructure } from './commission-infrastructure';

/** Admin identifier for commission policy storage (policies are stored in admin's UserDO) */
const COMMISSION_ADMIN_IDENTIFIER = 'tuanta2021@gmail.com';

export async function processCommissionOnOrder(
  c: Context,
  bindingName: string,
  user: { identifier: string; referrerId?: string; id?: number },
  orderRecord: { id: number; orderCode: string; finalAmount: number; currency: string }
): Promise<void> {
  console.log(`processCommissionOnOrder starting`);
  if (!user.referrerId) return;
  console.log(`processCommissionOnOrder: ${JSON.stringify(user.referrerId)}`);
  const adminDO = getIdFromName(c, COMMISSION_ADMIN_IDENTIFIER, bindingName) as DurableObjectStub<UserDO>;
  const policyInfra = createCommissionPolicyInfrastructure(adminDO);

  const policies = await policyInfra.list(50, 0, 'ACTIVE');
  const now = new Date();

  const applicable = policies.find((p: any) => {
    if (p.status !== 'ACTIVE') return false;
    const from = new Date(p.effectiveFrom);
    const to = new Date(p.effectiveTo);
    if (now < from || now > to) return false;
    if (p.applicableTo === 'ALL') return true;
    if (p.applicableTo === 'SPECIFIC' && p.targetIds?.includes(user.referrerId)) return true;
    if (p.applicableTo === 'USER_GROUP' && p.targetIds?.includes(user.referrerId)) return true;
    return false;
  });
  
  if (!applicable) return;
  console.log(`processCommissionOnOrder: ${JSON.stringify(applicable.commissionPercent)}`);
  const percent = applicable.commissionPercent ?? 0;
  if (percent <= 0) return;
  console.log(`processCommissionOnOrder: ${JSON.stringify(percent)}`);
  const usdVndRate = await getUsdVndRateFromEnv(c.env, bindingName);
  const orderAmountUsd =
    (orderRecord.currency ?? 'USD').toUpperCase() === 'USD'
      ? orderRecord.finalAmount
      : convertVndToUsd(orderRecord.finalAmount, usdVndRate);
  const commissionAmount = roundUsdAmount((orderAmountUsd * percent) / 100);

  const referrerDO = getIdFromName(c, user.referrerId, bindingName) as DurableObjectStub<UserDO>;
  const commissionInfra = createCommissionInfrastructure(referrerDO);
  console.log(`processCommissionOnOrder: ${JSON.stringify(commissionInfra)}`);
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
