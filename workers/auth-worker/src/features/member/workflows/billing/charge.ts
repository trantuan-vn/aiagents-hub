import { roundUsdAmount } from '../../../admin/service/pricing.js';
import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { recordWorkflowRoyalty, resolveWorkflowRoyalty } from './royalty.js';

export type UsageCharge = {
  usageUsd: number;
  royaltyUsd: number;
  chargedUsd: number;
};

export function asChargedUsd(charge: number | UsageCharge): number {
  return typeof charge === 'number' ? charge : charge.chargedUsd;
}

export function asRoyaltyUsd(charge: number | UsageCharge): number {
  return typeof charge === 'number' ? 0 : charge.royaltyUsd;
}

/** Report wallet debit to the execution engine. Royalty is only passed when A pays B. */
export function reportUsageCharge(
  onCost: ((chargedUsd: number, royaltyUsd?: number) => void) | undefined,
  charge: number | UsageCharge,
): number {
  const chargedUsd = asChargedUsd(charge);
  const royaltyUsd = asRoyaltyUsd(charge);
  if (royaltyUsd > 0) onCost?.(chargedUsd, royaltyUsd);
  else onCost?.(chargedUsd);
  return chargedUsd;
}

/**
 * Debit consumer A for AI/service usage plus sharing royalty, persist usage, then accrue royalty to B.
 */
export async function chargeServiceUsage(params: {
  env: Env;
  bindingName: string;
  userDO: DurableObjectStub<UserDO>;
  consumerIdentifier: string;
  usageData: Record<string, unknown>;
  usageUsd: number;
  workflowAttribution?: { workflowId: number; workflowOwnerId: string };
}): Promise<UsageCharge> {
  const usageUsd = roundUsdAmount(Math.max(0, Number(params.usageUsd) || 0));
  const users = await executeUtils.executeDynamicAction(params.userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u?.id) throw new Error('User profile not found');

  let royaltyUsd = 0;
  if (params.workflowAttribution && usageUsd > 0) {
    const royalty = await resolveWorkflowRoyalty(params.env, params.bindingName, {
      workflowId: params.workflowAttribution.workflowId,
      workflowOwnerId: params.workflowAttribution.workflowOwnerId,
      consumerIdentifier: params.consumerIdentifier,
      baseCostUsd: usageUsd,
    });
    royaltyUsd = royalty?.royaltyAmountUsd ?? 0;
  }

  const chargedUsd = roundUsdAmount(usageUsd + royaltyUsd);
  const balance = Number(u.walletBalance ?? u.wallet_balance ?? 0) || 0;
  if (chargedUsd > balance) throw new Error('Insufficient wallet balance');

  const usageData: Record<string, unknown> = {
    ...params.usageData,
    cost: usageUsd,
    queueStatus: params.usageData.queueStatus ?? 'pending',
  };
  if (params.workflowAttribution) {
    usageData.workflowId = params.workflowAttribution.workflowId;
    usageData.workflowOwnerId = params.workflowAttribution.workflowOwnerId;
  }
  if (royaltyUsd > 0) usageData.workflowRoyaltyVnd = royaltyUsd;

  const operations: Array<{
    table: string;
    operation: 'insert' | 'update';
    id?: number;
    data: Record<string, unknown>;
  }> = [];

  if (chargedUsd > 0) {
    operations.push({
      table: 'users',
      operation: 'update',
      id: u.id,
      data: { ...u, walletBalance: roundUsdAmount(balance - chargedUsd), queueStatus: 'pending' },
    });
  }

  operations.push({
    table: 'service_usages',
    operation: 'insert',
    data: usageData,
  });

  await executeUtils.executeDynamicAction(params.userDO, 'multi-table', { operations });

  if (params.workflowAttribution && usageUsd > 0) {
    await recordWorkflowRoyalty(params.env, params.bindingName, {
      workflowId: params.workflowAttribution.workflowId,
      workflowOwnerId: params.workflowAttribution.workflowOwnerId,
      consumerIdentifier: params.consumerIdentifier,
      baseCostUsd: usageUsd,
    });
  }

  return { usageUsd, royaltyUsd, chargedUsd };
}
