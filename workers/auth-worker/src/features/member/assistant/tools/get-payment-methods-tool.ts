import { tool } from 'ai';
import { z } from 'zod';

export function getPaymentMethodsTool() {
  return tool({
    description:
      'Lay danh sach phuong thuc thanh toan ho tro de user chon paymentMethod khi tao don hang.',
    inputSchema: z.object({}),
    async *execute() {
      yield { state: 'loading' as const };

      yield {
        state: 'ready' as const,
        ok: true,
        body: {
          paymentMethods: [
            { value: 'credit_card', label: 'Credit Card' },
            { value: 'bank_transfer', label: 'Bank Transfer' },
            { value: 'ewallet', label: 'E-Wallet' },
            { value: 'cod', label: 'Cash on Delivery' },
          ],
        },
      };
    },
  });
}
