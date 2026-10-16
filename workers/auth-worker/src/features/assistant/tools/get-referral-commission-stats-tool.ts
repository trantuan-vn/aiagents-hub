import { tool } from 'ai';
import { z } from 'zod';

import { getCommissionStatsFromD1 } from '../../member/referral/commission-d1';

const GetReferralCommissionStatsInputSchema = z.object({
  period: z.number().int().min(7).max(90).default(30),
});

export function getReferralCommissionStatsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Thong ke hoa hong tien cu (da ngung). Referral moi tra 150 CR khi mo tai khoan, khong tra tien.',
    inputSchema: GetReferralCommissionStatsInputSchema,
    async *execute(input: z.infer<typeof GetReferralCommissionStatsInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const days = Math.min(90, Math.max(7, input.period || 30));
        const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
        const db = c.env.D1DB;
        if (!db) throw new Error('D1 database binding not configured');
        const userId = (c.env[bindingName] as DurableObjectNamespace)
          .idFromName(user.identifier)
          .toString();
        const { byDay, totalAmount } = await getCommissionStatsFromD1(db, userId, fromTs);

        yield {
          state: 'ready' as const,
          ok: true,
          body: { byDay, totalAmount, period: days },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get referral commission stats';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
