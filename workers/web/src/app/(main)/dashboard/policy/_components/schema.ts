import { z } from "zod";

// Policy Type Schema
export const policyTypeSchema = z.enum(["PERCENTAGE", "FIXED_AMOUNT", "TIERED", "USAGE_BASED"]);
export const applicableToSchema = z.enum(["ALL", "SPECIFIC"]);
export const targetTypeSchema = z.enum(["SERVICE", "USER"]);
export const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const userRoleSchema = z.enum(["member", "admin"]);

// Tier Schema
export const tierSchema = z.object({
  minAmount: z.number().optional(),
  minUsage: z.number().optional(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.number(),
});

// Conditions Schema
export const conditionsSchema = z.object({
  userRoles: z.array(userRoleSchema).optional(),
  maxCalls: z.number().min(0).optional(),
  minQuantity: z.number().min(1).optional(),
  usagePercentage: z.number().min(0).max(100).optional(),
  tiers: z.array(tierSchema).optional(),
});

// Price Policy Schema
export const pricePolicySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1).max(300),
  code: z.string().min(3).max(50),
  type: policyTypeSchema,
  value: z.number().min(0),
  applicableTo: applicableToSchema,
  targetType: targetTypeSchema,
  targetIds: z.array(z.number()).optional(),
  conditions: conditionsSchema.optional(),
  priority: z.number().min(0),
  status: statusSchema,
  expiresAt: z.string().datetime().optional(),
});

// Create Policy Schema (without id)
export const createPricePolicySchema = pricePolicySchema.omit({ id: true });

// Update Policy Schema
export const updatePricePolicySchema = pricePolicySchema.partial();

// Types
export type PolicyType = z.infer<typeof policyTypeSchema>;
export type ApplicableTo = z.infer<typeof applicableToSchema>;
export type TargetType = z.infer<typeof targetTypeSchema>;
export type Status = z.infer<typeof statusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type Tier = z.infer<typeof tierSchema>;
export type Conditions = z.infer<typeof conditionsSchema>;
export type PricePolicy = z.infer<typeof pricePolicySchema>;
export type CreatePricePolicy = z.infer<typeof createPricePolicySchema>;
export type UpdatePricePolicy = z.infer<typeof updatePricePolicySchema>;
