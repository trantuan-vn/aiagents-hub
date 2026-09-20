import {
  DEFAULT_BILLING_CONFIG,
  SystemConfigSchema,
} from '../system-config/domain.js';
import { readSystemConfigJson } from '../system-config/read-cached.js';
import { billingEconomicsFromConfig, type BillingEconomics } from './credit.js';

export async function getBillingEconomicsFromEnv(env: Env): Promise<BillingEconomics> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
  try {
    const raw = await readSystemConfigJson(kv);
    if (!raw) return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
    const parsed = SystemConfigSchema.safeParse(raw);
    return billingEconomicsFromConfig(
      parsed.success ? parsed.data.billing : DEFAULT_BILLING_CONFIG,
    );
  } catch {
    return billingEconomicsFromConfig(DEFAULT_BILLING_CONFIG);
  }
}
