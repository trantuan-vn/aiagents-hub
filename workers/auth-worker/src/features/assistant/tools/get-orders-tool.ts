import { tool } from 'ai';
import { z } from 'zod';

import { createOrderApplicationService } from '../../member/order/application';

const GetOrdersInputSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export function getOrdersTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay danh sach don hang cua user theo bo loc trang thai va phan trang.',
    inputSchema: GetOrdersInputSchema,
    async *execute(input: z.infer<typeof GetOrdersInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const orderService = createOrderApplicationService(c, bindingName);
        const result = await orderService.getOrders(user.identifier, input);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get orders';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
