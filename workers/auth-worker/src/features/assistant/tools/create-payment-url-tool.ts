import { tool } from 'ai';
import { z } from 'zod';

import { getClientIp } from '../../../shared/utils';
import { createPaymentApplicationService } from '../../member/vnpay/application';
import { CreatePaymentSchema } from '../../member/vnpay/domain';

export function createPaymentUrlTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Tao URL thanh toan VNPay cho order cua user.',
    inputSchema: CreatePaymentSchema,
    async *execute(input: z.infer<typeof CreatePaymentSchema>) {
      yield { state: 'loading' as const };

      try {
        const paymentService = createPaymentApplicationService(c, bindingName);
        const ipAddr = getClientIp(c);
        const paymentUrl = await paymentService.createPaymentUrlUseCase(user.identifier, input, ipAddr);
        yield { state: 'ready' as const, ok: true, body: { paymentUrl } };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create payment URL';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
