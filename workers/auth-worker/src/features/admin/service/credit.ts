import {
  DEFAULT_BILLING_CONFIG,
  type BillingConfig,
  type ModelClass,
} from '../system-config/domain.js';
import {
  computeTokenCharge,
  extractUsageFromAiResponse,
  getServiceModel,
  getServicePricing,
  isCfModel,
  roundUsdAmount,
  type ServicePricing,
} from './pricing.js';

export const CREDIT_DECIMAL_PLACES = 4;
export const DEFAULT_CREDIT_PRICE_USD = DEFAULT_BILLING_CONFIG.CREDIT_PRICE_USD ?? 0.0077;

export type BillingUnit = 'usd' | 'credit';

export type BillingEconomics = {
  creditPriceUsd: number;
  infraBufferPct: number;
  paymentFeePct: number;
  creditExpiryDays: number;
  billingUnit: BillingUnit;
  coeffNotifyChangePct: number;
  coeffNotifyLeadDaysPro: number;
  coeffNotifyLeadDaysEnt: number;
  maxCreditBalancePro?: number;
  includedCogsUsdCap?: number;
  targetContributionPct: Record<ModelClass, number>;
  floorContributionPct: Record<ModelClass, number>;
};

export type CoeffChangeProposal = {
  modelClass: ModelClass;
  current: CreditCoeffs;
  proposed: CreditCoeffs;
  deltaPct: number;
  emergency: boolean;
  notify: boolean;
  leadDaysPro: number;
  leadDaysEnt: number;
};

export type CreditCoeffs = {
  input: number;
  output: number;
  inputCache: number;
};

export type UsageCredits = {
  creditsUsage: number;
  cogsAiUsd: number;
  cogsInfraUsdEst: number;
  revenueUsd: number;
  paymentFeeUsd: number;
  contributionUsd: number;
  contributionPct: number;
  modelClass: ModelClass;
  creditRateVersion: number;
  coeffs: CreditCoeffs;
};

const ZERO_USAGE: UsageCredits = {
  creditsUsage: 0,
  cogsAiUsd: 0,
  cogsInfraUsdEst: 0,
  revenueUsd: 0,
  paymentFeeUsd: 0,
  contributionUsd: 0,
  contributionPct: 0,
  modelClass: 'tiny',
  creditRateVersion: 0,
  coeffs: { input: 0, output: 0, inputCache: 0 },
};

const FRONTIER_MODEL =
  /gpt-4o(?!-|m)|gpt-4-turbo|gpt-5|o1[-.]|o3[-.]|o4[-.]|claude-3-opus|claude-opus|claude-4|gemini-2\.5-pro|gemini-1\.5-pro/i;

export function billingEconomicsFromConfig(billing?: BillingConfig | null): BillingEconomics {
  const b = billing ?? {};
  const creditPriceUsd = positive(b.CREDIT_PRICE_USD, DEFAULT_CREDIT_PRICE_USD);
  const unit = String(b.BILLING_UNIT ?? DEFAULT_BILLING_CONFIG.BILLING_UNIT ?? 'credit').toLowerCase();
  return {
    creditPriceUsd,
    billingUnit: unit === 'usd' ? 'usd' : 'credit',
    infraBufferPct: clampPct(b.INFRA_BUFFER_PCT, DEFAULT_BILLING_CONFIG.INFRA_BUFFER_PCT ?? 12),
    paymentFeePct: clampPct(b.PAYMENT_FEE_PCT, DEFAULT_BILLING_CONFIG.PAYMENT_FEE_PCT ?? 2),
    creditExpiryDays: Math.max(1, Math.floor(b.CREDIT_EXPIRY_DAYS ?? DEFAULT_BILLING_CONFIG.CREDIT_EXPIRY_DAYS ?? 365)),
    coeffNotifyChangePct: clampPct(b.COEFF_NOTIFY_CHANGE_PCT, DEFAULT_BILLING_CONFIG.COEFF_NOTIFY_CHANGE_PCT ?? 10),
    coeffNotifyLeadDaysPro: Math.max(
      0,
      Math.floor(b.COEFF_NOTIFY_LEAD_DAYS_PRO ?? DEFAULT_BILLING_CONFIG.COEFF_NOTIFY_LEAD_DAYS_PRO ?? 7),
    ),
    coeffNotifyLeadDaysEnt: Math.max(
      0,
      Math.floor(b.COEFF_NOTIFY_LEAD_DAYS_ENT ?? DEFAULT_BILLING_CONFIG.COEFF_NOTIFY_LEAD_DAYS_ENT ?? 30),
    ),
    maxCreditBalancePro:
      typeof b.MAX_CREDIT_BALANCE_PRO === 'number' && b.MAX_CREDIT_BALANCE_PRO > 0
        ? b.MAX_CREDIT_BALANCE_PRO
        : undefined,
    includedCogsUsdCap:
      typeof b.INCLUDED_COGS_USD_CAP === 'number' && b.INCLUDED_COGS_USD_CAP > 0
        ? b.INCLUDED_COGS_USD_CAP
        : undefined,
    targetContributionPct: {
      tiny: clampPct(b.TARGET_CONTRIBUTION_TINY_PCT, 65),
      mid: clampPct(b.TARGET_CONTRIBUTION_MID_PCT, 52),
      frontier: clampPct(b.TARGET_CONTRIBUTION_FRONTIER_PCT, 38),
    },
    floorContributionPct: {
      tiny: clampPct(b.FLOOR_CONTRIBUTION_TINY_PCT, 50),
      mid: clampPct(b.FLOOR_CONTRIBUTION_MID_PCT, 40),
      frontier: clampPct(b.FLOOR_CONTRIBUTION_FRONTIER_PCT, 30),
    },
  };
}

export function roundCredits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const factor = 10 ** CREDIT_DECIMAL_PLACES;
  return Math.round(amount * factor) / factor;
}

/** Charge rounding — never under-bill a run. */
export function roundCreditsUp(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const factor = 10 ** CREDIT_DECIMAL_PLACES;
  return Math.ceil(amount * factor - 1e-9) / factor;
}

export function usdToCredits(usd: number, creditPriceUsd = DEFAULT_CREDIT_PRICE_USD): number {
  const price = creditPriceUsd > 0 ? creditPriceUsd : DEFAULT_CREDIT_PRICE_USD;
  return roundCredits(Math.max(0, usd) / price);
}

export function creditsToUsd(credits: number, creditPriceUsd = DEFAULT_CREDIT_PRICE_USD): number {
  const price = creditPriceUsd > 0 ? creditPriceUsd : DEFAULT_CREDIT_PRICE_USD;
  return roundUsdAmount(Math.max(0, credits) * price);
}

export function vndToCredits(
  vnd: number,
  usdVndRate: number,
  creditPriceUsd = DEFAULT_CREDIT_PRICE_USD,
): number {
  if (vnd <= 0) return 0;
  const rate = usdVndRate > 0 ? usdVndRate : 1;
  return usdToCredits(vnd / rate, creditPriceUsd);
}

export function vndPerCredit(usdVndRate: number, creditPriceUsd = DEFAULT_CREDIT_PRICE_USD): number {
  const rate = usdVndRate > 0 ? usdVndRate : 1;
  const price = creditPriceUsd > 0 ? creditPriceUsd : DEFAULT_CREDIT_PRICE_USD;
  return Math.round(price * rate);
}

export function classifyModelClass(
  service: Record<string, unknown>,
  pricing?: ServicePricing | null,
): ModelClass {
  const stored = String(service.modelClass ?? service.model_class ?? '').toLowerCase();
  if (stored === 'tiny' || stored === 'mid' || stored === 'frontier') return stored;
  const model = getServiceModel(service) ?? '';
  if (FRONTIER_MODEL.test(model)) return 'frontier';
  const input = pricing?.priceInput ?? Number(service.priceInput ?? service.price_input ?? 0) ?? 0;
  if (input >= 2) return 'frontier';
  if (isCfModel(model) || input < 0.2) return 'tiny';
  return 'mid';
}

export function modelFamilyLabel(model: string | undefined): string {
  const id = (model ?? '').toLowerCase();
  if (!id) return '';
  if (id.includes('claude') || id.includes('anthropic')) return 'Claude';
  if (/gpt|openai|^o[1-4]/.test(id)) return 'GPT';
  if (id.includes('gemini') || id.includes('google')) return 'Gemini';
  if (id.includes('llama') || id.includes('meta')) return 'Llama';
  if (id.startsWith('@cf') || id.includes('workers-ai')) return 'Workers AI';
  return model!.trim();
}

export function infraAllocatedUsd(aiCostUsd: number, infraBufferPct: number): number {
  const buf = clampPct(infraBufferPct, 12) / 100;
  if (aiCostUsd <= 0 || buf <= 0 || buf >= 1) return 0;
  return roundUsdAmount((aiCostUsd * buf) / (1 - buf));
}

export function coeffPerMillion(usdPerMillion: number, modelClass: ModelClass, eco: BillingEconomics): number {
  const buffer = clampPct(eco.infraBufferPct, 12) / 100;
  const target = clampPct(eco.targetContributionPct[modelClass], 50) / 100;
  if (usdPerMillion <= 0 || buffer >= 1 || target >= 1) return 0;
  const loaded = usdPerMillion / (1 - buffer);
  const revenue = loaded / (1 - target);
  return revenue / eco.creditPriceUsd;
}

export function deriveCreditCoeffs(
  pricing: ServicePricing,
  modelClass: ModelClass,
  eco: BillingEconomics,
): CreditCoeffs {
  return {
    input: coeffPerMillion(pricing.priceInput, modelClass, eco),
    output: coeffPerMillion(pricing.priceOutput, modelClass, eco),
    inputCache: coeffPerMillion(pricing.priceInputCache ?? 0, modelClass, eco),
  };
}

export function getServiceCreditCoeffs(
  service: Record<string, unknown>,
  eco: BillingEconomics,
  modelClass: ModelClass,
  pricing: ServicePricing | null,
): CreditCoeffs | null {
  const input = parseCoeff(service.creditCoeffInput ?? service.credit_coeff_input);
  const output = parseCoeff(service.creditCoeffOutput ?? service.credit_coeff_output);
  if (input !== undefined && output !== undefined) {
    return {
      input,
      output,
      inputCache: parseCoeff(service.creditCoeffInputCache ?? service.credit_coeff_input_cache) ?? 0,
    };
  }
  if (!pricing) return null;
  return deriveCreditCoeffs(pricing, modelClass, eco);
}

function perMillion(tokens: number, coeff: number): number {
  return (Math.max(0, tokens) / 1_000_000) * Math.max(0, coeff);
}

export function computeCreditsFromUsage(coeffs: CreditCoeffs, usage: Record<string, unknown>): number {
  const hit = usage.prompt_cache_hit_tokens;
  const miss = usage.prompt_cache_miss_tokens;
  const hasCacheSplit = typeof hit === 'number' && typeof miss === 'number';
  if (hasCacheSplit) {
    return roundCreditsUp(
      perMillion(Number(hit), coeffs.input) +
        perMillion(Number(miss), coeffs.inputCache) +
        perMillion(Number(usage.completion_tokens ?? 0), coeffs.output),
    );
  }
  return roundCreditsUp(
    perMillion(Number(usage.prompt_tokens ?? 0), coeffs.input) +
      perMillion(Number(usage.completion_tokens ?? 0), coeffs.output),
  );
}

export function computeContribution(params: {
  creditsUsage: number;
  cogsAiUsd: number;
  eco: BillingEconomics;
  /** Prepaid Credit runs: 0. Do not take gateway fee again. */
  includePaymentFee?: boolean;
}): Pick<
  UsageCredits,
  'cogsInfraUsdEst' | 'revenueUsd' | 'paymentFeeUsd' | 'contributionUsd' | 'contributionPct'
> {
  const revenueUsd = creditsToUsd(params.creditsUsage, params.eco.creditPriceUsd);
  const cogsInfraUsdEst = infraAllocatedUsd(params.cogsAiUsd, params.eco.infraBufferPct);
  const paymentFeeUsd =
    params.includePaymentFee === true ? roundUsdAmount(revenueUsd * (params.eco.paymentFeePct / 100)) : 0;
  const contributionUsd = roundUsdSigned(revenueUsd - params.cogsAiUsd - cogsInfraUsdEst - paymentFeeUsd);
  const contributionPct = revenueUsd > 0 ? Math.round((contributionUsd / revenueUsd) * 10000) / 100 : 0;
  return { cogsInfraUsdEst, revenueUsd, paymentFeeUsd, contributionUsd, contributionPct };
}

/** Customer credits + internal contribution. Does not apply feePercent as a customer markup. */
export function computeUsageCredits(
  service: Record<string, unknown>,
  response: unknown,
  eco: BillingEconomics = billingEconomicsFromConfig(),
): UsageCredits {
  const usage = extractUsageFromAiResponse(response);
  const pricing = getServicePricing(service);
  if (!usage || !pricing) return ZERO_USAGE;
  const modelClass = classifyModelClass(service, pricing);
  const coeffs = getServiceCreditCoeffs(service, eco, modelClass, pricing);
  if (!coeffs) return { ...ZERO_USAGE, modelClass };
  const cogsAiUsd = roundUsdAmount(Math.max(0, computeTokenCharge(pricing, usage)));
  const creditsUsage = computeCreditsFromUsage(coeffs, usage);
  const contrib = computeContribution({ creditsUsage, cogsAiUsd, eco });
  const versionRaw = Number(service.creditRateVersion ?? service.credit_rate_version ?? 0);
  return {
    creditsUsage,
    cogsAiUsd,
    modelClass,
    coeffs,
    creditRateVersion: Number.isFinite(versionRaw) ? Math.max(0, Math.floor(versionRaw)) : 0,
    ...contrib,
  };
}

export function estimateCreditsPerRun(
  service: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
  typicalIn = 1000,
  typicalOut = 500,
): number {
  return computeUsageCredits(
    service,
    { usage: { prompt_tokens: typicalIn, completion_tokens: typicalOut } },
    eco,
  ).creditsUsage;
}

export function seedServiceCreditFields(
  service: Record<string, unknown>,
  eco: BillingEconomics = billingEconomicsFromConfig(),
): Record<string, unknown> {
  const pricing = getServicePricing(service);
  const model = getServiceModel(service);
  if (!pricing && !model) return service;
  const modelClass = classifyModelClass(service, pricing);
  const next: Record<string, unknown> = { ...service, modelClass };
  if (!pricing) return next;
  const hasStored =
    parseCoeff(service.creditCoeffInput ?? service.credit_coeff_input) !== undefined &&
    parseCoeff(service.creditCoeffOutput ?? service.credit_coeff_output) !== undefined;
  if (hasStored) return next;
  const coeffs = deriveCreditCoeffs(pricing, modelClass, eco);
  const versionRaw = Number(service.creditRateVersion ?? service.credit_rate_version ?? 0);
  return {
    ...next,
    creditCoeffInput: coeffs.input,
    creditCoeffOutput: coeffs.output,
    creditCoeffInputCache: coeffs.inputCache,
    creditRateVersion: Number.isFinite(versionRaw) && versionRaw > 0 ? Math.floor(versionRaw) : 1,
  };
}

function coeffDeltaPct(current: CreditCoeffs, proposed: CreditCoeffs): number {
  const keys: Array<keyof CreditCoeffs> = ['input', 'output', 'inputCache'];
  let max = 0;
  for (const key of keys) {
    const from = current[key];
    const to = proposed[key];
    if (from <= 0 && to <= 0) continue;
    if (from <= 0) {
      max = Math.max(max, 100);
      continue;
    }
    max = Math.max(max, Math.abs((to - from) / from) * 100);
  }
  return Math.round(max * 100) / 100;
}

/** Van 3.5: propose coeffs back to class target. Emergency when observed contribution < 0. */
export function proposeCreditCoeffs(params: {
  pricing: ServicePricing;
  modelClass: ModelClass;
  eco: BillingEconomics;
  current?: CreditCoeffs | null;
  observedContributionPct?: number;
}): CoeffChangeProposal {
  const proposed = deriveCreditCoeffs(params.pricing, params.modelClass, params.eco);
  const current = params.current ?? proposed;
  const deltaPct = coeffDeltaPct(current, proposed);
  const observed = params.observedContributionPct;
  const emergency = typeof observed === 'number' && observed < 0;
  const belowFloor =
    typeof observed === 'number' && observed < params.eco.floorContributionPct[params.modelClass];
  const notify = emergency || (belowFloor && deltaPct >= params.eco.coeffNotifyChangePct);
  return {
    modelClass: params.modelClass,
    current,
    proposed,
    deltaPct,
    emergency,
    notify,
    leadDaysPro: emergency ? 0 : params.eco.coeffNotifyLeadDaysPro,
    leadDaysEnt: emergency ? 0 : params.eco.coeffNotifyLeadDaysEnt,
  };
}

function positive(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampPct(n: number | undefined, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(95, Math.max(0, n));
}

function roundUsdSigned(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const factor = 1e8;
  return Math.round(amount * factor) / factor;
}

function parseCoeff(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
