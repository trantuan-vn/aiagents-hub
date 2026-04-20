import { tool } from 'ai';
import { z } from 'zod';

import { createVoucherApplicationService } from '../../admin/voucher/application';

const GetAvailableVouchersSchema = z.object({
  targetType: z.enum(['SERVICE', 'USER']).default('SERVICE'),
  serviceId: z.number().int().optional(),
  basePrice: z.number().min(0).optional(),
});

export function getAvailableVouchersTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Lay danh sach voucher kha dung de user chon voucherCode khi tao don hang.',
    inputSchema: GetAvailableVouchersSchema,
    async *execute(input: z.infer<typeof GetAvailableVouchersSchema>) {
      yield { state: 'loading' as const };

      try {
        const voucherApp = createVoucherApplicationService(c, bindingName);

        const vouchers =
          input.targetType === 'USER'
            ? await voucherApp.getAvailableUserVouchers(
                user.identifier,
                String(user.id),
                user.role,
                input.basePrice
              )
            : await voucherApp.getAvailableServiceVouchers(
                user.identifier,
                input.serviceId ? String(input.serviceId) : undefined,
                input.basePrice
              );

        const data = vouchers.map((voucher: any) => ({
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          type: voucher.type,
          targetType: voucher.targetType,
          discountValue: voucher.discountValue,
          minOrderAmount: voucher.minOrderAmount,
          maxDiscountAmount: voucher.maxDiscountAmount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
        }));

        yield {
          state: 'ready' as const,
          ok: true,
          body: {
            total: data.length,
            targetType: input.targetType,
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
