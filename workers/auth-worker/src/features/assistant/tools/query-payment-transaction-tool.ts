import { tool } from 'ai';
import { z } from 'zod';

import { getClientIp } from '../../../shared/utils';
import { createPaymentApplicationService } from '../../member/vnpay/application';
import { PaymentQuerySchema } from '../../member/vnpay/domain';

export function queryPaymentTransactionTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Truy van giao dich thanh toan VNPay theo paymentId va transDate.',
    inputSchema: PaymentQuerySchema,
    async *execute(input: z.infer<typeof PaymentQuerySchema>) {
      yield { state: 'loading' as const };

      try {
        const paymentService = createPaymentApplicationService(c, bindingName);
        const ipAddr = getClientIp(c);
        const result = await paymentService.queryTransactionUseCase(user.identifier, input, ipAddr);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to query payment transaction';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
