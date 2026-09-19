import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { bumpMarketingWorkflowRun } from '../../../admin/system-config/marketing-stats.js';
import { computeUsageCredits, type BillingEconomics } from '../../../admin/service/credit.js';
import { getBillingEconomicsFromEnv } from '../../../admin/service/get-billing-economics.js';
import { computeUsageChargeUsd, getServiceModel } from '../../../admin/service/pricing.js';
import { chargeServiceUsage, type UsageCharge } from './charge.js';
import { resolveCreditBalance, sweepExpiredWalletPatch, compactCreditLotsPatch } from './credit-wallet.js';
import {
  quotaFromUser,
  syncPlanPeriod,
  incrementDailyWorkflowRuns,
  incrementGraceRuns,
  assertCanStartWorkflowRun,
  canEnterGrace,
  parseGraceLastByWorkflow,
  graceMonthSpent,
  periodYm,
  type QuotaSnapshot,
} from './plan.js';
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

function applyPlanPatch(row: Record<string, unknown>, patch: ReturnType<typeof syncPlanPeriod>): Record<string, unknown> {
  return {
    ...row,
    planId: patch.planId,
    planPeriodYm: patch.planPeriodYm,
    workflowRunsToday: patch.workflowRunsToday,
    workflowRunsOn: patch.workflowRunsOn,
    ...(patch.planIncludedGrantPlanId ? { planIncludedGrantPlanId: patch.planIncludedGrantPlanId } : {}),
    ...(patch.planSource ? { planSource: patch.planSource } : {}),
    ...(patch.planStatus ? { planStatus: patch.planStatus } : {}),
    ...(patch.planCurrentPeriodEnd ? { planCurrentPeriodEnd: patch.planCurrentPeriodEnd } : {}),
    ...(patch.creditLotsJson
      ? {
          walletBalance: patch.walletBalance,
          walletCurrency: 'CR',
          creditLotsJson: patch.creditLotsJson,
        }
      : {}),
  };
}

export async function loadUserAndSyncPlan(
  userDO: DurableObjectStub<UserDO>,
  env: Env,
): Promise<{ row: Record<string, unknown>; quota: QuotaSnapshot; eco: BillingEconomics }> {
  const eco = await getBillingEconomicsFromEnv(env);
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u?.id) throw new Error('User profile not found');
  const row = u as Record<string, unknown>;
  const patch = syncPlanPeriod(row, eco);
  const mergedPlan = applyPlanPatch(row, patch);
  const expiredPatch = sweepExpiredWalletPatch(mergedPlan);
  const afterExpiry = expiredPatch ? { ...mergedPlan, ...expiredPatch } : mergedPlan;
  const compactPatch = compactCreditLotsPatch(afterExpiry);
  const merged = compactPatch ? { ...afterExpiry, ...compactPatch } : afterExpiry;
  const storedYm = String(row.planPeriodYm ?? row.plan_period_ym ?? '');
  const storedGrant = String(row.planIncludedGrantPlanId ?? row.plan_included_grant_plan_id ?? '');
  const storedPeriodEnd = String(row.planCurrentPeriodEnd ?? row.plan_current_period_end ?? '');
  if (
    patch.grantedIncluded ||
    patch.creditLotsJson != null ||
    patch.planPeriodYm !== storedYm ||
    row.planId == null ||
    (patch.planIncludedGrantPlanId != null && patch.planIncludedGrantPlanId !== storedGrant) ||
    (patch.planCurrentPeriodEnd != null && patch.planCurrentPeriodEnd !== storedPeriodEnd) ||
    expiredPatch != null ||
    compactPatch != null
  ) {
    await executeUtils.executeDynamicAction(
      userDO,
      'update',
      { id: row.id, ...merged, queueStatus: 'pending' },
      'users',
    );
  }
  return { row: merged, quota: quotaFromUser(merged, eco), eco };
}

export async function ensureWalletBalance(userDO: DurableObjectStub<UserDO>, env?: Env): Promise<void> {
  if (env) {
    const { row, eco } = await loadUserAndSyncPlan(userDO, env);
    const { credits } = resolveCreditBalance(row, eco);
    if (credits <= 0) throw new Error('Insufficient wallet balance');
    return;
  }
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u) throw new Error('Insufficient wallet balance');
  const balance = Number(u.walletBalance ?? u.wallet_balance ?? 0) || 0;
  if (balance <= 0) throw new Error('Insufficient wallet balance');
}

export type WorkflowRunQuotaOpts = {
  triggerKind?: string;
  graceWhenExhausted?: boolean;
  workflowId?: number;
};

/** One daily quota tick per workflow execution (not per AI node). */
export async function consumeDailyWorkflowRun(
  userDO: DurableObjectStub<UserDO>,
  env: Env,
  opts?: WorkflowRunQuotaOpts,
): Promise<{ usedGrace: boolean }> {
  const { row, quota } = await loadUserAndSyncPlan(userDO, env);
  try {
    assertCanStartWorkflowRun(quota);
    const bumped = incrementDailyWorkflowRuns(row);
    await executeUtils.executeDynamicAction(
      userDO,
      'update',
      { id: row.id, ...row, ...bumped, queueStatus: 'pending' },
      'users',
    );
    await bumpMarketingWorkflowRun(env);
    return { usedGrace: false };
  } catch {
    const lastMap = parseGraceLastByWorkflow(row.graceLastByWorkflowJson ?? row.grace_last_by_workflow_json);
    const wfKey = opts?.workflowId != null ? String(opts.workflowId) : '';
    const spent = graceMonthSpent(row);
    const entitled = canEnterGrace({
      quota,
      planStatus: String(row.planStatus ?? row.plan_status ?? 'active'),
      triggerKind: opts?.triggerKind,
      workflowGrace: opts?.graceWhenExhausted,
      workflowId: opts?.workflowId,
      lastGraceAtMs: wfKey ? lastMap[wfKey] : undefined,
    });
    if (!entitled || spent.cogsUsd >= quota.entitlement.graceCogsUsdCap || spent.credits >= quota.entitlement.graceCreditsPerMonth) {
      throw new Error('PAYMENT_REQUIRED: Daily workflow run quota exceeded');
    }
    const graceBump = incrementGraceRuns(row);
    if (wfKey) lastMap[wfKey] = Date.now();
    await executeUtils.executeDynamicAction(
      userDO,
      'update',
      {
        id: row.id,
        ...row,
        ...graceBump,
        graceMonthYm: periodYm(),
        graceLastByWorkflowJson: JSON.stringify(lastMap),
        queueStatus: 'pending',
      },
      'users',
    );
    await bumpMarketingWorkflowRun(env);
    return { usedGrace: true };
  }
}

export async function billAgentUsage(
  env: Env,
  bindingName: string,
  userDO: DurableObjectStub<UserDO>,
  consumerIdentifier: string,
  service: Record<string, unknown>,
  options: BillAgentUsageOptions,
): Promise<UsageCharge> {
  const eco = await getBillingEconomicsFromEnv(env);
  if (eco.billingUnit === 'usd') {
    const usageUsd = computeUsageChargeUsd(service, options.aiResponse);
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
        modelId: getServiceModel(service),
      },
    });
  }
  const usage = computeUsageCredits(service, options.aiResponse, eco);
  return chargeServiceUsage({
    env,
    bindingName,
    userDO,
    consumerIdentifier,
    creditsUsage: usage.creditsUsage,
    usageCredits: usage,
    workflowAttribution: options.workflowAttribution,
    usageData: {
      serviceId: service.id,
      endpoint: options.endpoint,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
      isError: false,
      modelId: getServiceModel(service),
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
