import { tool } from 'ai';
import { z } from 'zod';

import { createOrderApplicationService } from '../../member/order/application';
import { CreateOrderSchema, parseCreateOrderRequest } from '../../member/order/domain';
import { getMemberBillingParamsFromEnv } from '../../admin/system-config/get-usd-vnd-rate';

export function createOrderTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Tao lenh nap tien vao vi (amount VND, voucherCode tuy chon). Sau thanh toan thanh cong vi duoc cong tien.',
    inputSchema: CreateOrderSchema,
    async *execute(input: z.infer<typeof CreateOrderSchema>) {
      yield { state: 'loading' as const };

      try {
        const { minTopUpVnd } = await getMemberBillingParamsFromEnv(c.env);
        const request = parseCreateOrderRequest(input, minTopUpVnd);
        const orderService = createOrderApplicationService(c, bindingName);
        const result = await orderService.createOrder(user, request);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create order';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
