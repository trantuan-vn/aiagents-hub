import {
  DEFAULT_BILLING_CONFIG,
  KV_KEY,
  SystemConfigSchema,
} from '../../../admin/system-config/domain.js';

export async function getWorkflowRoyaltyPercentFromEnv(env: Env): Promise<number> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return DEFAULT_BILLING_CONFIG.WORKFLOW_ROYALTY_PERCENT ?? 5;
  try {
    const raw = await kv.get(KV_KEY, 'json');
    if (!raw) return DEFAULT_BILLING_CONFIG.WORKFLOW_ROYALTY_PERCENT ?? 5;
    const parsed = SystemConfigSchema.safeParse(raw);
    const pct = parsed.success
      ? parsed.data.billing?.WORKFLOW_ROYALTY_PERCENT
      : undefined;
    return typeof pct === 'number' ? pct : (DEFAULT_BILLING_CONFIG.WORKFLOW_ROYALTY_PERCENT ?? 5);
  } catch {
    return DEFAULT_BILLING_CONFIG.WORKFLOW_ROYALTY_PERCENT ?? 5;
  }
}
