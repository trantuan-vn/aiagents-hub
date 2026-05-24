import { z } from 'zod';

import { MembershipTierSchema } from '../../admin/membership-tier/domain';

/** Plain object schema for UserDO table registration (must stay ZodObject for .extend()). */
export const CommissionPolicyObjectSchema = z.object({
  name: z.string().min(1).max(300),
  code: z.string().min(3).max(50),
  /** Commission percentage (0-100) */
  commissionPercent: z.number().min(0).max(100),
  /** ALL referrers, or USER_GROUP (membership tiers of the referrer) */
  applicableTo: z.enum(['ALL', 'USER_GROUP']),
  /** Referrer membership tiers when applicableTo is USER_GROUP */
  membershipTiers: z.array(MembershipTierSchema).optional(),
  /** @deprecated Legacy SPECIFIC policies stored referrer identifiers here */
  targetIds: z.array(z.string()).optional(),
  /** Policy effective from (ISO date) */
  effectiveFrom: z.string().datetime(),
  /** Policy effective to (ISO date) */
  effectiveTo: z.string().datetime(),
  priority: z.number().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/** Commission policy: % commission referrer gets from referred user's orders */
export const CommissionPolicySchema = CommissionPolicyObjectSchema.refine(
  (data) => data.applicableTo !== 'USER_GROUP' || (data.membershipTiers?.length ?? 0) > 0,
  {
    message: 'USER_GROUP policies require at least one membership tier',
    path: ['membershipTiers'],
  },
);

/** Single commission record from an order */
export const CommissionSchema = z.object({
  orderId: z.number().int(),
  orderCode: z.string(),
  /** Referrer (broker) identifier - receives commission */
  referrerId: z.string(),
  /** Referred user identifier - placed the order */
  referredUserId: z.string(),
  /** Order amount in USD (converted from VND top-up when applicable) */
  orderAmount: z.number().min(0),
  /** Commission % applied */
  commissionPercent: z.number().min(0).max(100),
  /** Commission amount in USD */
  commissionAmount: z.number().min(0),
  currency: z.string().default('USD'),
  policyId: z.number().int().optional(),
});

export type CommissionPolicy = z.infer<typeof CommissionPolicySchema>;
export type Commission = z.infer<typeof CommissionSchema>;
