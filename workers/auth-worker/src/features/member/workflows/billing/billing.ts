import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import {
  computeUsageChargeUsd,
  getServiceModel,
  roundUsdAmount,
} from '../../../admin/service/pricing.js';
import { recordWorkflowRoyalty } from './royalty.js';

const AI_GATEWAY_ID = 'unitoken';
const DEFAULT_TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export interface BillAgentUsageOptions {
  endpoint: string;
  aiResponse: unknown;
  userAgent?: string;
  ipAddress?: string;
  workflowAttribution?: { workflowId: number; workflowOwnerId: string };
}

export async function resolveServiceByEndpoint(
  userDO: DurableObjectStub<UserDO>,
  endpoint: string,
): Promise<Record<string, unknown>> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    {
      where: [
        { field: 'endpoint', operator: '=', value: endpoint },
        { field: 'isActive', operator: '=', value: 1 },
      ],
    },
    'services',
  );
  const service = Array.isArray(rows) ? rows[0] : rows;
  if (!service) throw new Error(`Service not found for endpoint: ${endpoint}`);
  const status =
    (service as Record<string, unknown>).approvalStatus ??
    (service as Record<string, unknown>).approval_status ??
    'approved';
  if (status !== 'approved') {
    throw new Error(`Service is not approved yet: ${endpoint}`);
  }
  return service;
}

export async function ensureWalletBalance(userDO: DurableObjectStub<UserDO>): Promise<void> {
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  const balance = Number(u?.walletBalance ?? u?.wallet_balance ?? 0) || 0;
  if (balance <= 0) throw new Error('Insufficient wallet balance');
}

export async function billAgentUsage(
  env: Env,
  bindingName: string,
  userDO: DurableObjectStub<UserDO>,
  consumerIdentifier: string,
  service: Record<string, unknown>,
  options: BillAgentUsageOptions,
): Promise<number> {
  const chargeUsd = roundUsdAmount(computeUsageChargeUsd(service, options.aiResponse));
  const amountUsd = chargeUsd;

  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u?.id) throw new Error('User profile not found');

  const balance = Number(u.walletBalance ?? u.wallet_balance ?? 0) || 0;
  if (amountUsd > balance) throw new Error('Insufficient wallet balance');

  const usageData: Record<string, unknown> = {
    serviceId: service.id,
    endpoint: options.endpoint,
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
    isError: false,
    cost: amountUsd,
    queueStatus: 'pending',
  };

  if (options.workflowAttribution) {
    usageData.workflowId = options.workflowAttribution.workflowId;
    usageData.workflowOwnerId = options.workflowAttribution.workflowOwnerId;
  }

  const operations: Array<{
    table: string;
    operation: 'insert' | 'update';
    id?: number;
    data: Record<string, unknown>;
  }> = [];

  if (amountUsd > 0) {
    operations.push({
      table: 'users',
      operation: 'update',
      id: u.id,
      data: { ...u, walletBalance: balance - amountUsd, queueStatus: 'pending' },
    });
  }

  operations.push({
    table: 'service_usages',
    operation: 'insert',
    data: usageData,
  });

  await executeUtils.executeDynamicAction(userDO, 'multi-table', { operations });

  if (options.workflowAttribution && amountUsd > 0) {
    await recordWorkflowRoyalty(env, bindingName, {
      workflowId: options.workflowAttribution.workflowId,
      workflowOwnerId: options.workflowAttribution.workflowOwnerId,
      consumerIdentifier,
      baseCostUsd: amountUsd,
    });
  }

  return amountUsd;
}

export async function runTextModel(
  env: Env,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 1024,
  extra?: Record<string, unknown>,
): Promise<unknown> {
  const id = (modelId || DEFAULT_TEXT_MODEL) as keyof AiModels;

  const run = () =>
    env.AI.run(
      id,
      { messages, max_tokens: maxTokens, ...extra },
      { gateway: { id: AI_GATEWAY_ID } },
    );

  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/5016|agree|Prior to using this model/i.test(msg)) {
      await env.AI.run(id, { prompt: 'agree' });
      return await run();
    }
    throw e;
  }
}

export function extractTextFromAiResponse(response: unknown): string {
  if (!response || typeof response !== 'object') return String(response ?? '');
  const r = response as Record<string, unknown>;
  if (typeof r.response === 'string') return r.response;
  const inner = r.response;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const desc = (inner as Record<string, unknown>).description;
    if (typeof desc === 'string') return desc;
  }
  if (typeof r.result === 'string') return r.result;
  return JSON.stringify(response);
}

export function getModelForService(service: Record<string, unknown>): string {
  return getServiceModel(service) ?? DEFAULT_TEXT_MODEL;
}
