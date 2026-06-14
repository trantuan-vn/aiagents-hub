import { roundUsdAmount } from '../../../admin/service/pricing.js';
import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { getWorkflowRoyaltyPercentFromEnv } from './get-royalty-percent.js';

export interface WorkflowRoyaltyContext {
  workflowId: number;
  workflowOwnerId: string;
  consumerIdentifier: string;
  baseCostUsd: number;
  serviceUsageGlobalId?: number;
}

/**
 * Credits workflow owner with royalty % of service usage cost (USD).
 */
export async function recordWorkflowRoyalty(
  env: Env,
  bindingName: string,
  ctx: WorkflowRoyaltyContext,
): Promise<{ royaltyAmountUsd: number; royaltyPercent: number } | null> {
  const { workflowId, workflowOwnerId, consumerIdentifier, baseCostUsd } = ctx;
  if (!baseCostUsd || baseCostUsd <= 0) return null;
  if (!workflowOwnerId || !workflowId) return null;
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
  const consumerDoId = binding.idFromName(consumerIdentifier).toString();
  if (consumerDoId === workflowOwnerId) return null;
  const royaltyPercent = await getWorkflowRoyaltyPercentFromEnv(env);
  const royaltyAmountUsd = roundUsdAmount((baseCostUsd * royaltyPercent) / 100);
  if (royaltyAmountUsd <= 0) {
    return { royaltyAmountUsd: 0, royaltyPercent };
  }
  const ownerDO = binding.get(binding.idFromString(workflowOwnerId)) as DurableObjectStub<UserDO>;

  const workflows = await executeUtils.executeDynamicAction(
    ownerDO,
    'select',
    { where: { field: 'id', operator: '=', value: workflowId } },
    'agent_workflows',
  );
  const wf = Array.isArray(workflows) ? workflows[0] : workflows;
  if (!wf) return null;

  const ownerUsers = await executeUtils.executeDynamicAction(ownerDO, 'select', {}, 'users');
  const ownerUser = Array.isArray(ownerUsers) ? ownerUsers[0] : ownerUsers;
  if (!ownerUser?.id) return null;
  const currentEarnings =
    Number(wf.totalEarningsUsd ?? wf.totalEarningsVnd ?? wf.total_earnings_usd ?? wf.total_earnings_vnd ?? 0) || 0;
  const usageCount = Number(wf.usageCount ?? wf.usage_count ?? 0) || 0;
  const operations: Array<{
    table: string;
    operation: 'insert' | 'update';
    id?: number;
    data: Record<string, unknown>;
  }> = [
    {
      table: 'agent_workflows',
      operation: 'update',
      id: wf.id,
      data: {
        ...wf,
        totalEarningsUsd: currentEarnings + royaltyAmountUsd,
        usageCount: usageCount + 1,
      },
    },
    {
      table: 'workflow_royalties',
      operation: 'insert',
      data: {
        workflowId,
        workflowOwnerId,
        consumerUserId: consumerDoId.toString(),
        serviceUsageGlobalId: ctx.serviceUsageGlobalId,
        baseCostUsd,
        royaltyPercent,
        royaltyAmountUsd,
        currency: 'USD',
        queueStatus: 'pending',
      },
    },
  ];
  await executeUtils.executeDynamicAction(ownerDO, 'multi-table', { operations });

  return { royaltyAmountUsd, royaltyPercent };
}
