import { tool } from 'ai';
import { z } from 'zod';

import { getClientIp } from '../../../shared/utils';
import { createPaymentApplicationService } from '../../member/vnpay/application';
import { CreateRefundSchema } from '../../member/vnpay/domain';

export function refundPaymentTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Thuc hien hoan tien giao dich VNPay theo paymentId.',
    inputSchema: CreateRefundSchema,
    async *execute(input: z.infer<typeof CreateRefundSchema>) {
      yield { state: 'loading' as const };

      try {
        const paymentService = createPaymentApplicationService(c, bindingName);
        const ipAddr = getClientIp(c);
        const result = await paymentService.refundTransactionUseCase(user.identifier, input, ipAddr);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refund payment';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
