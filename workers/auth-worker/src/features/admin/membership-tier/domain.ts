import { z } from 'zod';

/** Membership tiers based on monthly top-up (VND). */
export const MembershipTierSchema = z.enum(['member', 'silver', 'gold', 'diamond']);
export type MembershipTier = z.infer<typeof MembershipTierSchema>;

export const MEMBERSHIP_TIER_ORDER: MembershipTier[] = ['member', 'silver', 'gold', 'diamond'];

export const MembershipTierConfigSchema = z.object({
  tier: MembershipTierSchema,
  label: z.string(),
  minVnd: z.number().min(0),
  maxVndExclusive: z.number().min(0).optional(),
  description: z.string().optional(),
});

export type MembershipTierConfig = z.infer<typeof MembershipTierConfigSchema>;

export function getDefaultTierConfigs(): MembershipTierConfig[] {
  return [
    { tier: 'member', label: 'Member', minVnd: 0, maxVndExclusive: 500_000, description: '>=0 và <500K VND/tháng' },
    { tier: 'silver', label: 'Silver', minVnd: 500_000, maxVndExclusive: 20_000_000, description: '>=500K và <20 triệu VND/tháng' },
    { tier: 'gold', label: 'Gold', minVnd: 20_000_000, maxVndExclusive: 50_000_000, description: '>=20 triệu và <50 triệu VND/tháng' },
    { tier: 'diamond', label: 'Diamond', minVnd: 50_000_000, description: '>50 triệu VND/tháng' },
  ];
}

export function currentPeriodYm(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Tier from cumulative monthly top-up (VND). Diamond when amount > 50M. */
export function tierFromMonthlyTopUpVnd(amountVnd: number): MembershipTier {
  const v = Math.max(0, Math.floor(amountVnd));
  if (v > 50_000_000) return 'diamond';
  if (v >= 20_000_000) return 'gold';
  if (v >= 500_000) return 'silver';
  return 'member';
}

/** Minimum VND in the previous month required to retain this tier. */
export function minVndToRetainTier(tier: MembershipTier): number {
  switch (tier) {
    case 'diamond':
      return 50_000_000 + 1;
    case 'gold':
      return 20_000_000;
    case 'silver':
      return 500_000;
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
