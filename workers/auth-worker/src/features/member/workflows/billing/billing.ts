import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import {
  computeUsageChargeUsd,
  getServiceModel,
  roundUsdAmount,
} from '../../../admin/service/pricing.js';
import { chargeServiceUsage, type UsageCharge } from './charge.js';
import { withAiCapacityRetry, WORKERS_AI_GATEWAY } from '../ai/workers-ai.js';

const DEFAULT_TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export interface BillAgentUsageOptions {
  endpoint: string;
  aiResponse: unknown;
  userAgent?: string;
  ipAddress?: string;
  workflowAttribution?: { workflowId: number; workflowOwnerId: string };
}

/** Workers AI response, AI SDK usage, or empty fallback the pricing extractor can read. */
export function asBillingAiResponse(usage: unknown, fallbackText = ''): unknown {
  if (usage != null && typeof usage === 'object') return usage;
  return { response: fallbackText };
}

export type GenerateTextUsageSource = {
  text?: unknown;
  usage?: unknown;
  totalUsage?: unknown;
  steps?: Array<{ usage?: unknown; text?: unknown }>;
};

/** One usage blob per underlying model HTTP call (`generateText` steps). */
export function llmUsagesFromGenerateText(
  result: GenerateTextUsageSource,
): Array<{ usage: unknown; text: string }> {
  const fallbackText = result.text == null ? '' : String(result.text);
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const fromSteps = steps
    .map((step) => ({
      usage: step?.usage,
      text: step?.text == null ? fallbackText : String(step.text),
    }))
    .filter((row) => row.usage != null);
  if (fromSteps.length) return fromSteps;
  const usage = result.totalUsage ?? result.usage;
  return usage != null ? [{ usage, text: fallbackText }] : [];
}

export async function billGenerateTextCalls(
  onBill: (usage: unknown, text: string) => Promise<void>,
  result: GenerateTextUsageSource,
  alreadyBilled = 0,
): Promise<void> {
  if (alreadyBilled > 0) return;
  const rows = llmUsagesFromGenerateText(result);
  if (!rows.length) {
    await onBill(undefined, result.text == null ? '' : String(result.text));
    return;
  }
  for (const row of rows) {
    await onBill(row.usage, row.text);
  }
}

function serviceApprovalStatus(service: Record<string, unknown>): string {
  return String(service.approvalStatus ?? service.approval_status ?? 'approved');
}

export async function findApprovedServiceByEndpoint(
  userDO: DurableObjectStub<UserDO>,
  endpoint: string,
): Promise<Record<string, unknown> | null> {
  if (!endpoint.trim()) return null;
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
  if (!service || typeof service !== 'object') return null;
  const record = service as Record<string, unknown>;
  if (serviceApprovalStatus(record) !== 'approved') return null;
  return record;
}

export async function findApprovedServiceByModel(
  userDO: DurableObjectStub<UserDO>,
  modelId: string,
): Promise<Record<string, unknown> | null> {
  if (!modelId.trim()) return null;
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    {
      where: [
        { field: 'model', operator: '=', value: modelId },
        { field: 'isActive', operator: '=', value: 1 },
      ],
    },
    'services',
  );
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (serviceApprovalStatus(record) === 'approved') return record;
  }
  return null;
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
  const record = service as Record<string, unknown>;
  if (serviceApprovalStatus(record) !== 'approved') {
    throw new Error(`Service is not approved yet: ${endpoint}`);
  }
  return record;
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
): Promise<UsageCharge> {
  const usageUsd = roundUsdAmount(computeUsageChargeUsd(service, options.aiResponse));
  return chargeServiceUsage({
    env,
    bindingName,
    userDO,
    consumerIdentifier,
    usageUsd,
    workflowAttribution: options.workflowAttribution,
    usageData: {
      serviceId: service.id,
      endpoint: options.endpoint,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
      isError: false,
    },
  });
}

export async function billEmbeddingUsage(
  env: Env,
  bindingName: string,
  userDO: DurableObjectStub<UserDO>,
  consumerIdentifier: string,
  service: Record<string, unknown>,
  options: Omit<BillAgentUsageOptions, 'aiResponse'> & { promptTokens: number },
): Promise<UsageCharge | 0> {
  if (options.promptTokens <= 0) return 0;
  return billAgentUsage(env, bindingName, userDO, consumerIdentifier, service, {
    endpoint: options.endpoint,
    aiResponse: { usage: { prompt_tokens: options.promptTokens, completion_tokens: 0 } },
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
    workflowAttribution: options.workflowAttribution,
  });
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
    withAiCapacityRetry(() =>
      env.AI.run(
        id,
        { messages, max_tokens: maxTokens, ...extra },
        { gateway: WORKERS_AI_GATEWAY },
      ),
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

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function messageFromChoice(choice: Record<string, unknown>): string {
  const message = choice.message;
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const m = message as Record<string, unknown>;
    return firstNonEmptyString(m.content, m.reasoning, m.reasoning_content);
  }
  return firstNonEmptyString(choice.text, choice.content);
}

/** Pull assistant text from Workers AI / OpenAI-style payloads. Never stringify the raw JSON. */
export function extractTextFromAiResponse(response: unknown): string {
  if (response == null) return '';
  if (typeof response === 'string') return response;
  if (typeof response !== 'object') return String(response);

  const r = response as Record<string, unknown>;
  if (typeof r.response === 'string' && r.response.trim()) return r.response;
  const inner = r.response;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const desc = (inner as Record<string, unknown>).description;
    if (typeof desc === 'string' && desc.trim()) return desc;
  }
  if (typeof r.result === 'string' && r.result.trim()) return r.result;

  const choices = r.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    return messageFromChoice(choices[0] as Record<string, unknown>);
  }
  return '';
}

export function finishReasonFromAiResponse(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
  return String((choices[0] as { finish_reason?: unknown }).finish_reason ?? '');
}

export function getModelForService(service: Record<string, unknown>): string {
  return getServiceModel(service) ?? DEFAULT_TEXT_MODEL;
}
