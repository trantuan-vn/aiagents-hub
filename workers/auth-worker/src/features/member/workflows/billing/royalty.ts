import { roundUsdAmount } from '../../../admin/service/pricing.js';
import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { runnerDoIdFromIdentifier } from '../execution/workflow-runner.js';
import { getWorkflowRoyaltyPercentFromEnv } from './get-royalty-percent.js';

export interface WorkflowRoyaltyContext {
  workflowId: number;
  workflowOwnerId: string;
  consumerIdentifier: string;
  baseCostUsd: number;
  serviceUsageGlobalId?: number;
}

export type ResolvedWorkflowRoyalty = {
  royaltyAmountUsd: number;
  royaltyPercent: number;
  consumerDoId: string;
};

export function computeWorkflowRoyaltyUsd(baseCostUsd: number, royaltyPercent: number): number {
  if (!baseCostUsd || baseCostUsd <= 0 || !royaltyPercent || royaltyPercent <= 0) return 0;
  return roundUsdAmount((baseCostUsd * royaltyPercent) / 100);
}

/**
 * Royalty charged to consumer A (and later accrued to owner B) when A runs B's shared workflow.
 * Returns null when A is the owner or the run has no billable usage.
 */
export async function resolveWorkflowRoyalty(
  env: Env,
  bindingName: string,
  ctx: Pick<WorkflowRoyaltyContext, 'workflowId' | 'workflowOwnerId' | 'consumerIdentifier' | 'baseCostUsd'>,
): Promise<ResolvedWorkflowRoyalty | null> {
  const { workflowId, workflowOwnerId, consumerIdentifier, baseCostUsd } = ctx;
  if (!baseCostUsd || baseCostUsd <= 0) return null;
  if (!workflowOwnerId || !workflowId) return null;
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
  const consumerDoId = runnerDoIdFromIdentifier(binding, consumerIdentifier);
  if (consumerDoId === workflowOwnerId) return null;
  const royaltyPercent = await getWorkflowRoyaltyPercentFromEnv(env);
  return {
    royaltyAmountUsd: computeWorkflowRoyaltyUsd(baseCostUsd, royaltyPercent),
    royaltyPercent,
    consumerDoId,
  };
}

/**
 * Accrues royalty % of service usage cost (USD) on the workflow owner's ledger.
 * Consumer A is debited separately in chargeServiceUsage — this only credits B.
 */
export async function recordWorkflowRoyalty(
  env: Env,
  bindingName: string,
  ctx: WorkflowRoyaltyContext,
): Promise<ResolvedWorkflowRoyalty | null> {
  const resolved = await resolveWorkflowRoyalty(env, bindingName, ctx);
  if (!resolved) return null;
  if (resolved.royaltyAmountUsd <= 0) return resolved;
  const { workflowId, workflowOwnerId } = ctx;
  const { royaltyAmountUsd, royaltyPercent, consumerDoId } = resolved;
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
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
        baseCostUsd: ctx.baseCostUsd,
        royaltyPercent,
        royaltyAmountUsd,
        currency: 'USD',
        queueStatus: 'pending',
      },
    },
  ];
  await executeUtils.executeDynamicAction(ownerDO, 'multi-table', { operations });

  return resolved;
}

/** Count one consumer run of a shared workflow (independent of billable AI steps). */
export async function incrementSharedWorkflowUsage(
  env: Env,
  bindingName: string,
  workflowId: number,
  workflowOwnerId: string,
): Promise<void> {
  if (!workflowId || !workflowOwnerId) return;
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
  const ownerDO = binding.get(binding.idFromString(workflowOwnerId)) as DurableObjectStub<UserDO>;
  const workflows = await executeUtils.executeDynamicAction(
    ownerDO,
    'select',
    { where: { field: 'id', operator: '=', value: workflowId } },
    'agent_workflows',
  );
  const wf = Array.isArray(workflows) ? workflows[0] : workflows;
  if (!wf) return;
  const usageCount = Number(wf.usageCount ?? wf.usage_count ?? 0) || 0;
  await executeUtils.executeDynamicAction(
    ownerDO,
    'update',
    { id: wf.id, ...wf, usageCount: usageCount + 1 },
    'agent_workflows',
  );
}
