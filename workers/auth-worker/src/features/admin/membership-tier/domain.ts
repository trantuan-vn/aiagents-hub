import { z } from 'zod';

/** Membership tiers based on monthly top-up (VND). */
export const MembershipTierSchema = z.enum(['member', 'silver', 'gold', 'diamond']);
export type MembershipTier = z.infer<typeof MembershipTierSchema>;

export const MEMBERSHIP_TIER_ORDER: MembershipTier[] = ['member', 'silver', 'gold', 'diamond'];

export const MEMBERSHIP_TIER_KV_KEY = 'membership-tier-configs';

export const TierThresholdsSchema = z
  .object({
    silver: z.number().int().min(1),
    gold: z.number().int().min(1),
    diamond: z.number().int().min(1),
  })
  .refine((d) => d.silver < d.gold && d.gold < d.diamond, {
    message: 'Thresholds must be strictly increasing: silver < gold < diamond',
  });

export type TierThresholds = z.infer<typeof TierThresholdsSchema>;

export const UpdateTierConfigsSchema = z.object({
  thresholds: TierThresholdsSchema,
});

export const MembershipTierConfigSchema = z.object({
  tier: MembershipTierSchema,
  label: z.string(),
  minVnd: z.number().min(0),
  maxVndExclusive: z.number().min(0).optional(),
  description: z.string().optional(),
});

export type MembershipTierConfig = z.infer<typeof MembershipTierConfigSchema>;

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  silver: 500_000,
  gold: 20_000_000,
  diamond: 50_000_000,
};

export const TIER_LABELS: Record<MembershipTier, string> = {
  member: 'Member',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

function formatVndShort(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return Number.isInteger(m) ? `${m} triệu` : `${m.toFixed(1)} triệu`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return String(amount);
}

export function buildTierConfigs(thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS): MembershipTierConfig[] {
  const { silver, gold, diamond } = thresholds;
  return [
    {
      tier: 'member',
      label: TIER_LABELS.member,
      minVnd: 0,
      maxVndExclusive: silver,
      description: `>=0 và <${formatVndShort(silver)} VND/tháng`,
    },
    {
      tier: 'silver',
      label: TIER_LABELS.silver,
      minVnd: silver,
      maxVndExclusive: gold,
      description: `>=${formatVndShort(silver)} và <${formatVndShort(gold)} VND/tháng`,
    },
    {
      tier: 'gold',
      label: TIER_LABELS.gold,
      minVnd: gold,
      maxVndExclusive: diamond,
      description: `>=${formatVndShort(gold)} và <${formatVndShort(diamond)} VND/tháng`,
    },
    {
      tier: 'diamond',
      label: TIER_LABELS.diamond,
      minVnd: diamond,
      description: `>${formatVndShort(diamond)} VND/tháng`,
    },
  ];
}

export function getDefaultTierConfigs(): MembershipTierConfig[] {
  return buildTierConfigs(DEFAULT_TIER_THRESHOLDS);
}

export function thresholdsFromConfigs(configs: MembershipTierConfig[]): TierThresholds {
  const byTier = Object.fromEntries(configs.map((c) => [c.tier, c.minVnd])) as Record<MembershipTier, number>;
  return {
    silver: byTier.silver ?? DEFAULT_TIER_THRESHOLDS.silver,
    gold: byTier.gold ?? DEFAULT_TIER_THRESHOLDS.gold,
    diamond: byTier.diamond ?? DEFAULT_TIER_THRESHOLDS.diamond,
  };
}

export function currentPeriodYm(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function resolveThresholds(configs?: MembershipTierConfig[]): TierThresholds {
  return configs ? thresholdsFromConfigs(configs) : DEFAULT_TIER_THRESHOLDS;
}

/** Tier from cumulative monthly top-up (VND). Diamond when amount > diamond threshold. */
export function tierFromMonthlyTopUpVnd(amountVnd: number, configs?: MembershipTierConfig[]): MembershipTier {
  const { silver, gold, diamond } = resolveThresholds(configs);
  const v = Math.max(0, Math.floor(amountVnd));
  if (v > diamond) return 'diamond';
  if (v >= gold) return 'gold';
  if (v >= silver) return 'silver';
  return 'member';
}

/** Minimum VND in the previous month required to retain this tier. */
export function minVndToRetainTier(tier: MembershipTier, configs?: MembershipTierConfig[]): number {
  const { silver, gold, diamond } = resolveThresholds(configs);
  switch (tier) {
    case 'diamond':
      return diamond + 1;
    case 'gold':
      return gold;
    case 'silver':
      return silver;
    default:
      return 0;
  }
}

export function downgradeOneTier(tier: MembershipTier): MembershipTier {
  const idx = MEMBERSHIP_TIER_ORDER.indexOf(tier);
  return idx <= 0 ? 'member' : MEMBERSHIP_TIER_ORDER[idx - 1];
}

export function upgradeTierIfHigher(current: MembershipTier, fromAmount: MembershipTier): MembershipTier {
  const ci = MEMBERSHIP_TIER_ORDER.indexOf(current);
  const ni = MEMBERSHIP_TIER_ORDER.indexOf(fromAmount);
  return ni > ci ? fromAmount : current;
}
