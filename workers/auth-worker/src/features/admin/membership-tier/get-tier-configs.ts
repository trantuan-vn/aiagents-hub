import {
  buildTierConfigs,
  DEFAULT_TIER_THRESHOLDS,
  MEMBERSHIP_TIER_KV_KEY,
  TierThresholdsSchema,
  type MembershipTierConfig,
  type TierThresholds,
} from './domain';

export async function getTierConfigsFromEnv(
  env: { SYSTEM_CONFIG_KV?: KVNamespace },
): Promise<MembershipTierConfig[]> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return buildTierConfigs(DEFAULT_TIER_THRESHOLDS);

  const raw = await kv.get(MEMBERSHIP_TIER_KV_KEY);
  if (!raw) return buildTierConfigs(DEFAULT_TIER_THRESHOLDS);

  try {
    const parsed = JSON.parse(raw) as { thresholds?: TierThresholds };
    const thresholds = TierThresholdsSchema.parse(parsed.thresholds ?? DEFAULT_TIER_THRESHOLDS);
    return buildTierConfigs(thresholds);
  } catch {
    return buildTierConfigs(DEFAULT_TIER_THRESHOLDS);
  }
}

export async function saveTierConfigsToKv(
  kv: KVNamespace,
  thresholds: TierThresholds,
): Promise<MembershipTierConfig[]> {
  const validated = TierThresholdsSchema.parse(thresholds);
  const configs = buildTierConfigs(validated);
  await kv.put(MEMBERSHIP_TIER_KV_KEY, JSON.stringify({ thresholds: validated }));
  return configs;
}
