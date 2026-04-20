import { tool } from 'ai';
import { z } from 'zod';

import { executeUtils, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';

const GetReferralCommissionsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  period: z.number().int().min(1).max(365).default(30),
});

export function getReferralCommissionsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay danh sach hoa hong referral theo bo loc thoi gian va phan trang.',
    inputSchema: GetReferralCommissionsInputSchema,
    async *execute(input: z.infer<typeof GetReferralCommissionsInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const days = Math.min(365, Math.max(1, input.period || 30));
        const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
        const limit = Math.min(100, Math.max(1, input.limit || 50));
        const offset = Math.max(0, input.offset || 0);
        const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
        const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
          where: { field: 'created_at', operator: '>=', value: fromTs },
          orderBy: { field: 'created_at', direction: 'DESC' },
          limit,
          offset,
        }, 'commissions').catch(() => []);

        yield {
          state: 'ready' as const,
          ok: true,
          body: { commissions: rows || [], limit, offset, period: days },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get referral commissions';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
