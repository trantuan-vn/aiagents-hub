import { tool } from 'ai';
import { z } from 'zod';

import { createOrderApplicationService } from '../../member/order/application';
import { CreateOrderSchema } from '../../member/order/domain';

export function createOrderTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Tao don hang (order) cho user da dang nhap. Can it nhat mot item voi serviceId, basePrice, quantity.',
    inputSchema: CreateOrderSchema,
    async *execute(input: z.infer<typeof CreateOrderSchema>) {
      yield { state: 'loading' as const };

      try {
        const request = CreateOrderSchema.parse(input);
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
