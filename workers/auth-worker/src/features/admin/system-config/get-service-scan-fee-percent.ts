import { DEFAULT_BILLING_CONFIG, KV_KEY, SystemConfigSchema } from './domain.js';

const MAX_SERVICE_FEE_MARKUP_PERCENT = 500;

/** feePercent stored on service = 100 + markup (e.g. markup 30 → feePercent 130). */
export function feePercentFromMarkupPercent(markupPercent: number): number {
  const m = Number.isFinite(markupPercent) && markupPercent >= 0 ? markupPercent : 0;
  return 100 + Math.min(m, MAX_SERVICE_FEE_MARKUP_PERCENT);
}

export async function getServiceFeeMarkupPercentFromEnv(env: Env): Promise<number> {
  const fallback = DEFAULT_BILLING_CONFIG.SERVICE_FEE_MARKUP_PERCENT ?? 0;
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return fallback;
  try {
    const raw = await kv.get(KV_KEY, 'json');
    if (!raw) return fallback;
    const parsed = SystemConfigSchema.safeParse(raw);
    const pct = parsed.success ? parsed.data.billing?.SERVICE_FEE_MARKUP_PERCENT : undefined;
    if (typeof pct !== 'number' || pct < 0) return fallback;
    return Math.min(pct, MAX_SERVICE_FEE_MARKUP_PERCENT);
  } catch {
    return fallback;
  }
}

export async function getServiceScanFeePercentFromEnv(env: Env): Promise<number> {
  return feePercentFromMarkupPercent(await getServiceFeeMarkupPercentFromEnv(env));
}
