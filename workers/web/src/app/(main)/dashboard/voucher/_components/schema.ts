import { z } from "zod";

// Voucher Schema — user targeting only; empty `applicableUsers` = any user (subject to `userRoles`)
export const voucherSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(300),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "USAGE_BASED", "TIERED"]),
  discountValue: z.number().min(0),
  minOrderAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().min(1).optional(),
  usedCount: z.number().min(0).default(0),
  applicableUsers: z.array(z.number()).optional(),
  userRoles: z.array(z.enum(["member", "admin"])).optional(),
  expiresAt: z
    .preprocess((val) => {
      if (val === null || val === undefined || val === "") return undefined;
      const num = Number(val);

      if (!isNaN(num)) {
        const date = new Date();

        if (num < 10000) {
          const daysToAdd = num > 360 ? 360 : num;
          date.setDate(date.getDate() + daysToAdd);
          return date.toISOString();
        } else {
          return new Date(num).toISOString();
        }
      }

      return val;
    }, z.string().datetime().optional())
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).default("ACTIVE"),
  conditions: z
    .object({
      tiers: z
        .array(
          z.object({
            minAmount: z.number(),
            type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
            value: z.number(),
          }),
        )
        .optional(),
      maxCalls: z.number().min(0).optional(),
      minUsage: z.number().min(0).optional(),
    })
    .nullish(),
  createdAt: z.string().datetime().optional(),
});

// Create Voucher Schema (without id and createdAt)
export const createVoucherSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(300),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "USAGE_BASED", "TIERED"]),
  discountValue: z.number().min(0),
  minOrderAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().min(1).optional(),
  applicableUsers: z.array(z.number()).optional(),
  userRoles: z.array(z.enum(["member", "admin"])).optional(),
  expiresAt: z.string().datetime().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]),
  conditions: z
    .object({
      tiers: z
        .array(
          z.object({
            minAmount: z.number(),
            type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
            value: z.number(),
          }),
        )
        .optional(),
      maxCalls: z.number().min(0).optional(),
      minUsage: z.number().min(0).optional(),
    })
    .nullish(),
});

// Update Voucher Schema
export const updateVoucherSchema = voucherSchema.partial();

// Apply Voucher Schema
export const applyVoucherSchema = z.object({
  voucherCode: z.string().min(3).max(20),
  basePrice: z.number().min(0),
  orderAmount: z.number().min(0),
  currentCalls: z.number().min(0).optional(),
  userId: z.number().int(),
  userRole: z.enum(["member", "admin"]).optional(),
});

// Types
export type Voucher = z.infer<typeof voucherSchema>;
export type CreateVoucher = z.infer<typeof createVoucherSchema>;
export type UpdateVoucher = z.infer<typeof updateVoucherSchema>;
export type ApplyVoucher = z.infer<typeof applyVoucherSchema>;
