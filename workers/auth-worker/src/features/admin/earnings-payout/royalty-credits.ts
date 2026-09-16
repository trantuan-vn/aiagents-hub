import { usdToCredits } from '../service/credit.js';
import { roundUsdAmount } from '../service/pricing.js';

/** Payout cash is commission USD plus the Credit-royalty converted back to USD. */
export function payoutTotalUsd(commissionUsd: number, workflowRoyaltyUsd: number): number {
  return roundUsdAmount((Number(commissionUsd) || 0) + (Number(workflowRoyaltyUsd) || 0));
}

export function workflowRoyaltyUsdToCr(usd: number, creditPriceUsd: number): number {
  return usdToCredits(usd, creditPriceUsd);
}

export function withWorkflowRoyaltyCredits<
  T extends {
    commissionAmountUsd: number;
    workflowRoyaltyAmountUsd: number;
    totalAmountUsd: number;
    periods?: Array<{
      commissionAmountUsd: number;
      workflowRoyaltyAmountUsd: number;
      totalAmountUsd: number;
      workflowRoyaltyAmountCr?: number;
    }>;
  },
>(item: T, creditPriceUsd: number): T & { workflowRoyaltyAmountCr: number } {
  const commissionUsd = Number(item.commissionAmountUsd) || 0;
  const workflowUsd = Number(item.workflowRoyaltyAmountUsd) || 0;
  const periods = item.periods?.map((period) => {
    const periodCommission = Number(period.commissionAmountUsd) || 0;
    const periodWorkflow = Number(period.workflowRoyaltyAmountUsd) || 0;
    return {
      ...period,
      workflowRoyaltyAmountCr: workflowRoyaltyUsdToCr(periodWorkflow, creditPriceUsd),
      totalAmountUsd: payoutTotalUsd(periodCommission, periodWorkflow),
    };
  });
  return {
    ...item,
    workflowRoyaltyAmountCr: workflowRoyaltyUsdToCr(workflowUsd, creditPriceUsd),
    totalAmountUsd: payoutTotalUsd(commissionUsd, workflowUsd),
    ...(periods ? { periods } : {}),
  };
}
