/** USD per 1M tokens */
export type ServicePricing = {
  priceInput: number;
  priceOutput: number;
  priceInputCache?: number;
};

export function isCfModel(model: string | null | undefined): boolean {
  return Boolean(model?.startsWith('@cf'));
}

export function isProxyModel(model: string | null | undefined): boolean {
  return Boolean(model && !isCfModel(model));
}

export function getServiceModel(service: Record<string, unknown>): string | undefined {
  const raw = service.model ?? service.model_id;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function parseUsdPriceField(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

export function getServicePricing(service: Record<string, unknown>): ServicePricing | null {
  const priceInput = parseUsdPriceField(service.priceInput ?? service.price_input);
  if (priceInput === undefined) return null;

  const outputRaw = service.priceOutput ?? service.price_output;
  let priceOutput: number;
  if (outputRaw === undefined || outputRaw === null || outputRaw === '') {
    priceOutput = 0;
  } else {
    priceOutput = Number(outputRaw);
    if (Number.isNaN(priceOutput) || priceOutput < 0) return null;
  }
  const cacheRaw = service.priceInputCache ?? service.price_input_cache;
  const priceInputCache =
    cacheRaw === undefined || cacheRaw === null ? undefined : Number(cacheRaw);
  if (priceInputCache !== undefined && (Number.isNaN(priceInputCache) || priceInputCache < 0)) {
    return null;
  }
  return { priceInput, priceOutput, priceInputCache };
}

function perMillionTokens(tokens: number, usdPerMillion: number): number {
  return (Math.max(0, tokens) / 1_000_000) * usdPerMillion;
}

/** % multiplier on token cost (100 = pass-through, 120 = charge 120% of base cost). */
export function getServiceFeePercent(service: Record<string, unknown>): number {
  const raw = service.feePercent ?? service.fee_percent;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) return 100;
  return n;
}

export function applyFeePercent(baseCost: number, feePercent: number): number {
  if (baseCost <= 0) return 0;
  const pct = feePercent > 0 ? feePercent : 100;
  return Math.max(0, baseCost * (pct / 100));
}

const USD_DECIMAL_PLACES = 8;

/** USD monetary amounts (wallet, usage cost, royalty, commission) — 8 decimal places. */
export function roundUsdAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const factor = 10 ** USD_DECIMAL_PLACES;
  return Math.round(amount * factor) / factor;
}

/** User-entered wallet top-up (max 2 decimal places; avoids float noise like 110.00008344). */
export function roundWalletTopUpUsd(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

/** @deprecated Use roundUsdAmount */
export const roundVndAmount = roundUsdAmount;

/** VND top-up → USD wallet credit. */
export function convertVndToUsd(vndAmount: number, usdVndRate: number): number {
  if (vndAmount <= 0) return 0;
  const rate = usdVndRate > 0 ? usdVndRate : 1;
  return roundUsdAmount(vndAmount / rate);
}

/** Payout QR — USD earnings → VND transfer amount. */
export function convertUsdToVnd(usdAmount: number, usdVndRate: number): number {
  if (usdAmount <= 0) return 0;
  const rate = usdVndRate > 0 ? usdVndRate : 1;
  return Math.round(usdAmount * rate);
}

/** Token charge with fee% applied (USD). */
export function computeUsageChargeUsd(
  service: Record<string, unknown>,
  response: unknown,
): number {
  const usage = extractUsageFromAiResponse(response);
  const pricing = getServicePricing(service);
  if (!usage) return 0;
  if (!pricing) {
    console.warn('[pricing] AI usage received but service has no valid priceInput configured');
    return 0;
  }
  const baseCost = Math.max(0, computeTokenCharge(pricing, usage));
  return applyFeePercent(baseCost, getServiceFeePercent(service));
}

/** Charge from AI usage + service pricing (USD). */
export function computeTokenCharge(pricing: ServicePricing, usage: Record<string, unknown>): number {
  const hit = usage.prompt_cache_hit_tokens;
  const miss = usage.prompt_cache_miss_tokens;
  const hasCacheSplit = typeof hit === 'number' && typeof miss === 'number';

  if (hasCacheSplit) {
    const completion = Number(usage.completion_tokens ?? 0);
    return (
      perMillionTokens(Number(hit), pricing.priceInput) +
      perMillionTokens(Number(miss), pricing.priceInputCache ?? 0) +
      perMillionTokens(completion, pricing.priceOutput)
    );
  }

  const prompt = Number(usage.prompt_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? 0);
  return perMillionTokens(prompt, pricing.priceInput) + perMillionTokens(completion, pricing.priceOutput);
}

function normalizeUsageRecord(usage: Record<string, unknown>): Record<string, unknown> {
  if (!('inputTokens' in usage) && !('outputTokens' in usage)) {
    return usage;
  }
  const input = Number(usage.inputTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  const details = usage.inputTokenDetails;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const noCache = (details as Record<string, unknown>).noCacheTokens;
    const cacheRead = (details as Record<string, unknown>).cacheReadTokens;
    if (typeof noCache === 'number' && typeof cacheRead === 'number') {
      return {
        prompt_cache_hit_tokens: cacheRead,
        prompt_cache_miss_tokens: noCache,
        completion_tokens: output,
      };
    }
  }
  return { prompt_tokens: input, completion_tokens: output };
}

export function extractUsageFromAiResponse(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  if (r.usage && typeof r.usage === 'object' && !Array.isArray(r.usage)) {
    return normalizeUsageRecord(r.usage as Record<string, unknown>);
  }
  const inner = r.response;
  if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
    const u = (inner as Record<string, unknown>).usage;
    if (u && typeof u === 'object' && !Array.isArray(u)) {
      return normalizeUsageRecord(u as Record<string, unknown>);
    }
  }
  return null;
}
