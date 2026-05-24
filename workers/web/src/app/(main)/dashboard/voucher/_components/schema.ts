import { z } from "zod";

const membershipTierEnum = z.enum(["member", "silver", "gold", "diamond"]);

export const voucherSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(300),
  discountPercent: z.number().min(0).max(100),
  minOrderAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().min(1).optional(),
  usedCount: z.number().min(0).default(0),
  applicableTo: z.enum(["ALL", "GROUPS"]).default("ALL"),
  membershipTiers: z.array(membershipTierEnum).optional(),
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
        }
        return new Date(num).toISOString();
      }
      return val;
    }, z.string().datetime().optional())
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).default("ACTIVE"),
  createdAt: z.string().datetime().optional(),
  estimatedDiscount: z.number().optional(),
});

export const createVoucherSchema = z
  .object({
    code: z.string().min(3).max(50),
    name: z.string().min(1).max(300),
    discountPercent: z.number().min(0).max(100),
    minOrderAmount: z.number().min(0).optional(),
    maxDiscountAmount: z.number().min(0).optional(),
    usageLimit: z.number().min(1).optional(),
    applicableTo: z.enum(["ALL", "GROUPS"]),
    membershipTiers: z.array(membershipTierEnum).optional(),
    expiresAt: z.string().datetime().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]),
  })
  .refine((data) => data.applicableTo !== "GROUPS" || (data.membershipTiers?.length ?? 0) > 0, {
    message: "Select at least one membership tier",
    path: ["membershipTiers"],
  });

export const updateVoucherSchema = voucherSchema.partial();

export type Voucher = z.infer<typeof voucherSchema>;
export type CreateVoucher = z.infer<typeof createVoucherSchema>;
export type UpdateVoucher = z.infer<typeof updateVoucherSchema>;
export type MembershipTier = z.infer<typeof membershipTierEnum>;

export const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = {
  member: "Member",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};
