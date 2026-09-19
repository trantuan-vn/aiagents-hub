import { executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { parsePlanInterval, resolvePlanId, type PlanId, type PlanInterval } from '../workflows/billing/plan';
import { openPlanOrderIdsCoveredBySubscribe } from './plan-order';

export async function completePlanOrdersCoveredByPaypalSubscribe(params: {
  userDO: DurableObjectStub<UserDO>;
  planId: PlanId;
  interval: PlanInterval;
  paypalSubscriptionId?: string;
}): Promise<number> {
  if (params.planId === 'free') return 0;
  const rows = await executeUtils.executeDynamicAction(params.userDO, 'select', {}, 'orders');
  const list = (Array.isArray(rows) ? rows : rows ? [rows] : []) as Array<Record<string, unknown>>;
  const ids = openPlanOrderIdsCoveredBySubscribe(list, params.planId, params.interval);
  const note = params.paypalSubscriptionId
    ? `Paid via PayPal Subscribe ${params.paypalSubscriptionId}`
    : 'Paid via PayPal Subscribe';
  for (const id of ids) {
    await executeUtils.executeDynamicAction(
      params.userDO,
      'update',
      { id, status: 'COMPLETED', queueStatus: 'pending', internalNotes: note },
      'orders',
    );
  }
  return ids.length;
}

/** Close leftover prepaid plan invoices once PayPal Subscribe already granted the same plan. */
export async function settleOpenPlanOrdersIfPaypalActive(userDO: DurableObjectStub<UserDO>): Promise<void> {
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const row = (Array.isArray(users) ? users[0] : users) as Record<string, unknown> | undefined;
  if (!row) return;
  const source = String(row.planSource ?? row.plan_source ?? '').toLowerCase();
  if (source !== 'paypal') return;
  const planId = resolvePlanId(row);
  if (planId === 'free') return;
  await completePlanOrdersCoveredByPaypalSubscribe({
    userDO,
    planId,
    interval: parsePlanInterval(row.planInterval ?? row.plan_interval),
    paypalSubscriptionId: String(row.paypalSubscriptionId ?? row.paypal_subscription_id ?? ''),
  });
}
