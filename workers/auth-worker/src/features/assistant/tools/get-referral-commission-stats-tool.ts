import { tool } from 'ai';
import { z } from 'zod';

import { executeUtils, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';

const GetReferralCommissionStatsInputSchema = z.object({
  period: z.number().int().min(7).max(90).default(30),
});

export function getReferralCommissionStatsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay thong ke hoa hong referral theo ngay trong khoang 7-90 ngay.',
    inputSchema: GetReferralCommissionStatsInputSchema,
    async *execute(input: z.infer<typeof GetReferralCommissionStatsInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const days = Math.min(90, Math.max(7, input.period || 30));
        const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
        const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
        const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
          where: { field: 'created_at', operator: '>=', value: fromTs },
          orderBy: { field: 'created_at', direction: 'ASC' },
        }, 'commissions').catch(() => []);

        const byDate = new Map<string, number>();
        for (const row of rows || []) {
          const ts = row.created_at ?? row.createdAt ?? 0;
          const dateKey = new Date(ts).toISOString().slice(0, 10);
          byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(row.commissionAmount || 0));
        }

        const byDay = Array.from(byDate.entries())
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const totalAmount = byDay.reduce((sum, item) => sum + item.total, 0);

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
