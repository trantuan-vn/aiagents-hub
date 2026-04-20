import { tool } from 'ai';
import { z } from 'zod';

import { createOrderApplicationService } from '../../member/order/application';

const CancelOrderInputSchema = z.object({
  orderId: z.number().int().positive(),
});

export function cancelOrderTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Huy don hang theo orderId cua user da dang nhap.',
    inputSchema: CancelOrderInputSchema,
    async *execute(input: z.infer<typeof CancelOrderInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const orderService = createOrderApplicationService(c, bindingName);
        const result = await orderService.cancelOrder(user.identifier, input.orderId);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to cancel order';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
