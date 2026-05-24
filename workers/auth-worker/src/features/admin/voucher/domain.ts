import { z } from 'zod';

import { MembershipTierSchema } from '../membership-tier/domain';

/** Percentage discount on order amount; applies to all users or selected membership tiers. */
export const VoucherSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(300),
  discountPercent: z.number().min(0).max(100),
  minOrderAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().min(1).optional(),
  usedCount: z.number().min(0).default(0),
  applicableTo: z.enum(['ALL', 'GROUPS']).default('ALL'),
  membershipTiers: z.array(MembershipTierSchema).optional(),
  expiresAt: z.preprocess(
    (val) => {
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
    },
    z.string().datetime().optional(),
  ),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).default('ACTIVE'),
});

export const ApplyVoucherSchema = z.object({
  voucherCode: z.string().min(3).max(20),
  basePrice: z.number().min(0),
  orderAmount: z.number().min(0),
  userId: z.number().int(),
  membershipTier: MembershipTierSchema.optional(),
});

export const ValidateVoucherRequestSchema = z.object({
  voucherCode: z.string().min(3).max(20),
  basePrice: z.number().min(0),
  orderAmount: z.number().min(0),
  userId: z.number().int(),
  membershipTier: MembershipTierSchema.optional(),
});

export const VoucherStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']);

export type Voucher = z.infer<typeof VoucherSchema>;
export type ApplyVoucher = z.infer<typeof ApplyVoucherSchema>;
export type ValidateVoucherRequest = z.infer<typeof ValidateVoucherRequestSchema>;

export interface IVoucherInfrastructureService {
  createVoucher(request: Voucher): Promise<any>;
  applyVoucher(request: ApplyVoucher): Promise<any>;
  getVouchers(status?: string): Promise<any[]>;
  getVoucherByCode(voucherCode: string): Promise<any>;
  validateVoucher(request: ValidateVoucherRequest): Promise<any>;
  updateVoucherStatus(voucherId: number, status: string): Promise<any>;
  getAvailableVouchers(
    userId: number,
    membershipTier?: string,
    basePrice?: number,
  ): Promise<any[]>;
  pickBestVoucher(
    userId: number,
    membershipTier: string | undefined,
    basePrice: number,
  ): Promise<{ code: string; discountAmount: number; voucher: any } | null>;
}

export function calculateVoucherDiscount(voucher: any, basePrice: number): number {
  const pct = Number(voucher.discountPercent ?? voucher.discountValue ?? 0);
  let discount = basePrice * (pct / 100);
  const maxCap = voucher.maxDiscountAmount;
  if (typeof maxCap === 'number' && maxCap > 0 && discount > maxCap) {
    discount = maxCap;
  }
  return Math.min(Math.max(0, discount), basePrice);
}
