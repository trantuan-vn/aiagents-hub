import { z } from "zod";

// Voucher Schema
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
  targetType: z.enum(["SERVICE", "USER", "BOTH"]).default("BOTH"),
  applicableServices: z.array(z.number()).optional(),
  applicableUsers: z.array(z.number()).optional(),
  userRoles: z.array(z.enum(["member", "admin"])).default([]),
  expiresAt: z
    .preprocess(
      (val) => {
        if (val === null || val === undefined || val === "") return undefined;
        // Xử lý cả string số và number
        const num = Number(val);

        if (!isNaN(num)) {
          const date = new Date();

          // Phân biệt: số nhỏ là ngày, số lớn là timestamp
          if (num < 10000) {
            // Giả sử < 10000 là số ngày
            // Giới hạn tối đa 360 ngày nếu cần
            const daysToAdd = num > 360 ? 360 : num;
            date.setDate(date.getDate() + daysToAdd);
            return date.toISOString();
          } else {
            // Số lớn: coi như timestamp
            return new Date(num).toISOString();
          }
        }

        return val;
      },
      z.string().datetime().optional(),
    )
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
  targetType: z.enum(["SERVICE", "USER", "BOTH"]),
  applicableServices: z.array(z.number()).optional(),
  applicableUsers: z.array(z.number()).optional(),
  userRoles: z.array(z.enum(["member", "admin"])),
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
  serviceId: z.number().int().optional(),
  currentCalls: z.number().min(0).optional(),
  userId: z.number().int().optional(),
  userRole: z.enum(["member", "admin"]).optional(),
});

// Types
export type Voucher = z.infer<typeof voucherSchema>;
export type CreateVoucher = z.infer<typeof createVoucherSchema>;
export type UpdateVoucher = z.infer<typeof updateVoucherSchema>;
export type ApplyVoucher = z.infer<typeof applyVoucherSchema>;
