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

export function getServicePricing(service: Record<string, unknown>): ServicePricing | null {
  const priceInput = Number(service.priceInput ?? service.price_input);
  const priceOutput = Number(service.priceOutput ?? service.price_output);
  if (Number.isNaN(priceInput) || Number.isNaN(priceOutput) || priceInput < 0 || priceOutput < 0) {
    return null;
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

/** Wallet / service_usages.cost — VND per 1 USD from system config. */
export function convertUsdToVnd(usdAmount: number, usdVndRate: number): number {
  if (usdAmount <= 0) return 0;
  const rate = usdVndRate > 0 ? usdVndRate : 1;
  return Math.max(0, Math.round(usdAmount * rate));
}

/** Token charge with fee% applied (USD). */
export function computeUsageChargeUsd(
  service: Record<string, unknown>,
  response: unknown,
): number {
  const usage = extractUsageFromAiResponse(response);
  console.log('usage: ', JSON.stringify(usage));
  const pricing = getServicePricing(service);
  if (!usage || !pricing) {
    if (usage && !pricing) {
      console.warn('[pricing] AI usage received but service has no token pricing configured');
    }
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
