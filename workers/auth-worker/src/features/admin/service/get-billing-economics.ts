import {
  DEFAULT_BILLING_CONFIG,
  KV_KEY,
  SystemConfigSchema,
} from '../system-config/domain.js';
import { billingEconomicsFromConfig, type BillingEconomics } from './credit.js';

export async function getBillingEconomicsFromEnv(env: Env): Promise<BillingEconomics> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
  try {
    const raw = await kv.get(KV_KEY, 'json');
    if (!raw) return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
    const parsed = SystemConfigSchema.safeParse(raw);
    return billingEconomicsFromConfig(
      parsed.success ? parsed.data.billing : DEFAULT_BILLING_CONFIG,
    );
  } catch {
    return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
  }
}
