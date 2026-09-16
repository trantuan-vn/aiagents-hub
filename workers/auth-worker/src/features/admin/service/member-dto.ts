import { estimateCreditsPerRun, modelFamilyLabel } from './credit.js';

const MEMBER_HIDDEN = new Set([
  'priceInput',
  'price_input',
  'priceOutput',
  'price_output',
  'priceInputCache',
  'price_input_cache',
  'feePercent',
  'fee_percent',
  'cogsAiUsd',
  'cogs_ai_usd',
  'cogsInfraUsdEst',
  'cogs_infra_usd_est',
  'contributionPct',
  'contribution_pct',
  'contributionUsd',
  'contribution_usd',
  'paymentFeeUsd',
  'payment_fee_usd',
  'revenueUsd',
  'revenue_usd',
  'creditCoeffInput',
  'credit_coeff_input',
  'creditCoeffOutput',
  'credit_coeff_output',
  'creditCoeffInputCache',
  'credit_coeff_input_cache',
  'targetContributionPct',
  'creditRateVersion',
  'credit_rate_version',
  'modelClass',
  'model_class',
]);

export function toMemberServiceDto(
  service: Record<string, unknown>,
  opts?: { enterprise?: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(service)) {
    if (MEMBER_HIDDEN.has(key)) continue;
    out[key] = value;
  }
  const model = typeof service.model === 'string' ? service.model : undefined;
  out.estimatedCreditsPerRun = estimateCreditsPerRun(service);
  if (opts?.enterprise) out.modelFamily = modelFamilyLabel(model);
  else delete out.modelFamily;
  return out;
}

export function toMemberServiceList(
  services: unknown,
  opts?: { enterprise?: boolean },
): Record<string, unknown>[] {
  const list = Array.isArray(services) ? services : services ? [services] : [];
  return list
    .filter((row) => row && typeof row === 'object')
    .map((row) => toMemberServiceDto(row as Record<string, unknown>, opts));
}
