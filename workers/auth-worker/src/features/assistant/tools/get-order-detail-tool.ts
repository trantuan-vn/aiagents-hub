import { tool } from 'ai';
import { z } from 'zod';

import { createOrderApplicationService } from '../../member/order/application';

const GetOrderDetailInputSchema = z.object({
  orderId: z.number().int().positive(),
});

export function getOrderDetailTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay chi tiet mot don hang theo orderId cua user da dang nhap.',
    inputSchema: GetOrderDetailInputSchema,
    async *execute(input: z.infer<typeof GetOrderDetailInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const orderService = createOrderApplicationService(c, bindingName);
        const result = await orderService.getOrderDetail(user.identifier, input.orderId);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get order detail';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
