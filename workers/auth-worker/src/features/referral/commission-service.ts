import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
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
  if (!user.referrerId) return;

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

  const percent = applicable.commissionPercent ?? 0;
  if (percent <= 0) return;

  const commissionAmount = Math.round((orderRecord.finalAmount * percent) / 100);

  const referrerDO = getIdFromName(c, user.referrerId, bindingName) as DurableObjectStub<UserDO>;
  const commissionInfra = createCommissionInfrastructure(referrerDO);

  await commissionInfra.insert({
    orderId: orderRecord.id,
    orderCode: orderRecord.orderCode,
    referrerId: user.referrerId,
    referredUserId: user.identifier,
    orderAmount: orderRecord.finalAmount,
    commissionPercent: percent,
    commissionAmount,
    currency: orderRecord.currency ?? 'VND',
    policyId: applicable.id,
  });
}
