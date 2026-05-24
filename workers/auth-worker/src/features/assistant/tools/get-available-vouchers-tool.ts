import { tool } from 'ai';
import { z } from 'zod';

import { createVoucherApplicationService } from '../../admin/voucher/application';

const GetAvailableVouchersSchema = z.object({
  basePrice: z.number().min(0).optional(),
});

export function getAvailableVouchersTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Lay danh sach voucher kha dung de user chon voucherCode khi tao don hang (theo user dang nhap).',
    inputSchema: GetAvailableVouchersSchema,
    async *execute(input: z.infer<typeof GetAvailableVouchersSchema>) {
      yield { state: 'loading' as const };

      try {
        const voucherApp = createVoucherApplicationService(c, bindingName);

        const userId = typeof user.id === 'number' ? user.id : parseInt(String(user.id), 10);
        if (!Number.isFinite(userId)) {
          yield { state: 'ready' as const, ok: false, error: 'User id missing for voucher list' };
          return;
        }

        const membershipTier = String(user.membershipTier ?? user.membership_tier ?? 'member');
        const vouchers = await voucherApp.getAvailableVouchers(
          user.identifier,
          userId,
          membershipTier,
          input.basePrice,
        );

        const data = vouchers.map((voucher: any) => ({
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          discountPercent: voucher.discountPercent ?? voucher.discountValue,
          minOrderAmount: voucher.minOrderAmount,
          maxDiscountAmount: voucher.maxDiscountAmount,
          estimatedDiscount: voucher.estimatedDiscount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
        }));

        yield {
          state: 'ready' as const,
          ok: true,
          body: {
            total: data.length,
            vouchers: data,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get available vouchers';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
