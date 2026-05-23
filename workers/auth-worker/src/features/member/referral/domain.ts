import { z } from 'zod';

/** Commission policy: % commission referrer gets from referred user's orders */
export const CommissionPolicySchema = z.object({
  name: z.string().min(1).max(300),
  code: z.string().min(3).max(50),
  /** Commission percentage (0-100) */
  commissionPercent: z.number().min(0).max(100),
  /** Apply to: ALL users, SPECIFIC user(s), or USER_GROUP (targetIds = referrer identifiers) */
  applicableTo: z.enum(['ALL', 'SPECIFIC', 'USER_GROUP']),
  /** For SPECIFIC: referrer identifiers. For USER_GROUP: group identifiers (if any) */
  targetIds: z.array(z.string()).optional(),
  /** Policy effective from (ISO date) */
  effectiveFrom: z.string().datetime(),
  /** Policy effective to (ISO date) */
  effectiveTo: z.string().datetime(),
  priority: z.number().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

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
