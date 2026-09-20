import {
  DEFAULT_BILLING_CONFIG,
  SystemConfigSchema,
} from '../../../admin/system-config/domain.js';
import { readSystemConfigJson } from '../../../admin/system-config/read-cached.js';

export async function getWorkflowRoyaltyPercentFromEnv(env: Env): Promise<number> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return DEFAULT_BILLING_CONFIG.WORKFLOW_ROYALTY_PERCENT ?? 5;
  try {
    const raw = await readSystemConfigJson(kv);
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
