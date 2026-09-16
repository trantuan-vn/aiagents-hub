import { creditsToUsd, roundCredits, type UsageCredits } from '../../../admin/service/credit.js';
import { getBillingEconomicsFromEnv } from '../../../admin/service/get-billing-economics.js';
import { getServiceModel, roundUsdAmount } from '../../../admin/service/pricing.js';
import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { applyWalletCreditDebit, resolveCreditBalance } from './credit-wallet.js';
import { recordWorkflowRoyalty, resolveWorkflowRoyalty } from './royalty.js';

export type UsageCharge = {
  usageUsd: number;
  royaltyUsd: number;
  chargedUsd: number;
  creditsUsage: number;
  creditsRoyalty: number;
  creditsCharged: number;
  cogsAiUsd?: number;
  cogsInfraUsdEst?: number;
  paymentFeeUsd?: number;
  revenueUsd?: number;
  contributionUsd?: number;
  contributionPct?: number;
  modelClass?: string;
  creditRateVersion?: number;
};

export function asChargedUsd(charge: number | UsageCharge): number {
  if (typeof charge === 'number') return charge;
  return charge.creditsCharged > 0 || charge.creditsUsage > 0 ? charge.creditsCharged : charge.chargedUsd;
}

export function asRoyaltyUsd(charge: number | UsageCharge): number {
  if (typeof charge === 'number') return 0;
  return charge.creditsRoyalty > 0 ? charge.creditsRoyalty : charge.royaltyUsd;
}

/** Report wallet debit to the execution engine. Royalty is only passed when A pays B. */
export function reportUsageCharge(
  onCost: ((charged: number, royalty?: number) => void) | undefined,
  charge: number | UsageCharge,
): number {
  const charged = asChargedUsd(charge);
  const royalty = asRoyaltyUsd(charge);
  if (royalty > 0) onCost?.(charged, royalty);
  else onCost?.(charged);
  return charged;
}

/**
 * Debit consumer for AI usage (Credit path) plus sharing royalty, persist usage, accrue royalty to B.
 * Legacy callers may pass `usageUsd` only — wallet still USD until first Credit debit/top-up.
 */
export async function chargeServiceUsage(params: {
  env: Env;
  bindingName: string;
  userDO: DurableObjectStub<UserDO>;
  consumerIdentifier: string;
  usageData: Record<string, unknown>;
  usageUsd?: number;
  creditsUsage?: number;
  usageCredits?: Partial<UsageCredits> & { creditsUsage?: number; cogsAiUsd?: number };
  workflowAttribution?: { workflowId: number; workflowOwnerId: string };
}): Promise<UsageCharge> {
  const eco = await getBillingEconomicsFromEnv(params.env);
  const creditsFromParams = Number(params.creditsUsage ?? params.usageCredits?.creditsUsage ?? 0) || 0;
  const creditMode = creditsFromParams > 0;

  const users = await executeUtils.executeDynamicAction(params.userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u?.id) throw new Error('User profile not found');
  const userRow = u as Record<string, unknown>;

  if (!creditMode) {
    return chargeLegacyUsd(params, userRow);
  }

  const creditsUsage = roundCredits(creditsFromParams);
  let creditsRoyalty = 0;
  const revenueUsd = creditsToUsd(creditsUsage, eco.creditPriceUsd);
  if (params.workflowAttribution && creditsUsage > 0) {
    const royalty = await resolveWorkflowRoyalty(params.env, params.bindingName, {
      workflowId: params.workflowAttribution.workflowId,
      workflowOwnerId: params.workflowAttribution.workflowOwnerId,
      consumerIdentifier: params.consumerIdentifier,
      baseCostUsd: revenueUsd,
    });
    creditsRoyalty = roundCredits(usdToCreditsSafe(royalty?.royaltyAmountUsd ?? 0, eco.creditPriceUsd));
  }

  const creditsCharged = roundCredits(creditsUsage + creditsRoyalty);
  const royaltyUsd = creditsToUsd(creditsRoyalty, eco.creditPriceUsd);
  const chargedUsd = roundUsdAmount(revenueUsd + royaltyUsd);

  const resolved = resolveCreditBalance(userRow, eco);
  if (creditsCharged > resolved.credits) throw new Error('Insufficient wallet balance');
  const uc = params.usageCredits ?? {};
  const cogsAiUsd = roundUsdAmount(Number(uc.cogsAiUsd ?? 0) || 0);
  const walletPatch = applyWalletCreditDebit(userRow, creditsCharged, eco, undefined, {
    cogsAiUsd,
    includedCogsUsdCap: eco.includedCogsUsdCap,
  });
  const usageData: Record<string, unknown> = {
    ...params.usageData,
    cost: revenueUsd,
    creditsUsage,
    creditsRoyalty,
    creditsCharged,
    cogsAiUsd,
    cogsInfraUsdEst: uc.cogsInfraUsdEst ?? 0,
    paymentFeeUsd: uc.paymentFeeUsd ?? 0,
    revenueUsd: uc.revenueUsd ?? revenueUsd,
    contributionUsd: uc.contributionUsd ?? 0,
    contributionPct: uc.contributionPct ?? 0,
    modelClass: uc.modelClass,
    creditRateVersion: uc.creditRateVersion ?? 0,
    queueStatus: params.usageData.queueStatus ?? 'pending',
  };
  const modelId = params.usageData.modelId ?? getServiceModel(params.usageData);
  if (modelId) usageData.modelId = modelId;
  if (params.workflowAttribution) {
    usageData.workflowId = params.workflowAttribution.workflowId;
    usageData.workflowOwnerId = params.workflowAttribution.workflowOwnerId;
  }
  if (creditsRoyalty > 0) usageData.workflowRoyaltyVnd = royaltyUsd;

  const operations: Array<{
    table: string;
    operation: 'insert' | 'update';
    id?: number;
    data: Record<string, unknown>;
  }> = [];

  if (creditsCharged > 0) {
    operations.push({
      table: 'users',
      operation: 'update',
      id: u.id as number,
      data: { ...userRow, ...walletPatch, queueStatus: 'pending' },
    });
  }

  operations.push({
    table: 'service_usages',
    operation: 'insert',
    data: usageData,
  });

  await executeUtils.executeDynamicAction(params.userDO, 'multi-table', { operations });

  if (params.workflowAttribution && creditsUsage > 0) {
    await recordWorkflowRoyalty(params.env, params.bindingName, {
      workflowId: params.workflowAttribution.workflowId,
      workflowOwnerId: params.workflowAttribution.workflowOwnerId,
      consumerIdentifier: params.consumerIdentifier,
      baseCostUsd: revenueUsd,
    });
  }

  return {
    usageUsd: revenueUsd,
    royaltyUsd,
    chargedUsd,
    creditsUsage,
    creditsRoyalty,
    creditsCharged,
    cogsAiUsd,
    cogsInfraUsdEst: Number(uc.cogsInfraUsdEst ?? 0) || 0,
    paymentFeeUsd: Number(uc.paymentFeeUsd ?? 0) || 0,
    revenueUsd: Number(uc.revenueUsd ?? revenueUsd) || revenueUsd,
    contributionUsd: Number(uc.contributionUsd ?? 0) || 0,
    contributionPct: Number(uc.contributionPct ?? 0) || 0,
    modelClass: uc.modelClass,
    creditRateVersion: uc.creditRateVersion ?? 0,
  };
}

function usdToCreditsSafe(usd: number, price: number): number {
  if (usd <= 0 || price <= 0) return 0;
  return roundCredits(usd / price);
}

async function chargeLegacyUsd(
  params: {
    env: Env;
    bindingName: string;
    userDO: DurableObjectStub<UserDO>;
    consumerIdentifier: string;
    usageData: Record<string, unknown>;
    usageUsd?: number;
    workflowAttribution?: { workflowId: number; workflowOwnerId: string };
  },
  userRow: Record<string, unknown>,
): Promise<UsageCharge> {
  const usageUsd = roundUsdAmount(Math.max(0, Number(params.usageUsd) || 0));
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
  const balance = Number(userRow.walletBalance ?? userRow.wallet_balance ?? 0) || 0;
  if (chargedUsd > balance) throw new Error('Insufficient wallet balance');

  const usageData: Record<string, unknown> = {
    ...params.usageData,
    cost: usageUsd,
    creditsUsage: 0,
    creditsRoyalty: 0,
    creditsCharged: 0,
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
      id: userRow.id as number,
      data: { ...userRow, walletBalance: roundUsdAmount(balance - chargedUsd), queueStatus: 'pending' },
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

  return {
    usageUsd,
    royaltyUsd,
    chargedUsd,
    creditsUsage: 0,
    creditsRoyalty: 0,
    creditsCharged: 0,
  };
}
