import { z } from 'zod';

// Vouchers apply to users only. `applicableUsers` = DB user ids; empty/omitted = any user (subject to `userRoles`).
export const VoucherSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(300),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'USAGE_BASED', 'TIERED']),
  discountValue: z.number().min(0),
  minOrderAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().min(1).optional(),
  usedCount: z.number().min(0).default(0),
  applicableUsers: z.array(z.number()).optional(),
  userRoles: z.array(z.enum(['member', 'admin'])).default([]),
  expiresAt: z.preprocess(
    (val) => {
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
    },
    z.string().datetime().optional(),
  ),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).default('ACTIVE'),
  conditions: z
    .object({
      tiers: z
        .array(
          z.object({
            minAmount: z.number(),
            type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
            value: z.number(),
          }),
        )
        .optional(),
      maxCalls: z.number().min(0).optional(),
      minUsage: z.number().min(0).optional(),
    })
    .nullish(),
});

export const ApplyVoucherSchema = z.object({
  voucherCode: z.string().min(3).max(20),
  basePrice: z.number().min(0),
  orderAmount: z.number().min(0),
  currentCalls: z.number().min(0).optional(),
  userId: z.number().int(),
  userRole: z.enum(['member', 'admin']).optional(),
});

export const ValidateVoucherRequestSchema = z.object({
  voucherCode: z.string().min(3).max(20),
  basePrice: z.number().min(0),
  orderAmount: z.number().min(0),
  currentCalls: z.number().min(0).optional(),
  userId: z.number().int(),
  userRole: z.enum(['member', 'admin']).optional(),
});

export const VoucherStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']);

// Types
export type Voucher = z.infer<typeof VoucherSchema>;
export type ApplyVoucher = z.infer<typeof ApplyVoucherSchema>;
export type ValidateVoucherRequest = z.infer<typeof ValidateVoucherRequestSchema>;

// Domain Interfaces
export interface IVoucherInfrastructureService {
  createVoucher(request: Voucher): Promise<any>;
  applyVoucher(request: ApplyVoucher): Promise<any>;
  getVouchers(status?: string): Promise<any[]>;
  getVoucherByCode(voucherCode: string): Promise<any>;
  validateVoucher(request: ValidateVoucherRequest): Promise<any>;
  updateVoucherStatus(voucherId: number, status: string): Promise<any>;
  getAvailableVouchers(userId: number, userRole?: string, basePrice?: number): Promise<any[]>;
}
