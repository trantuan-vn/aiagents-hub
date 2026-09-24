import { tool } from 'ai';
import { z } from 'zod';

import { getExecutionLogs, type LogsFilters } from '../../member/monitor/logs/infrastructure';

const GetMonitorLogsInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  workflowId: z.number().int().positive().optional(),
  status: z.enum(['running', 'completed', 'failed', 'pending_human', 'cancelled']).optional(),
  dateFrom: z.number().int().nonnegative().optional(),
  dateTo: z.number().int().nonnegative().optional(),
});

export function getMonitorLogsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay danh sach lan chay workflow (execution ledger) cua user theo bo loc va phan trang.',
    inputSchema: GetMonitorLogsInputSchema,
    async *execute(input: z.infer<typeof GetMonitorLogsInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const db = c.env.D1DB;
        if (!db) {
          throw new Error('D1 database binding not configured');
        }

        const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();
        const filters: LogsFilters = {
          limit: input.limit,
          offset: input.offset,
          workflowId: input.workflowId,
          status: input.status,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        };
        const result = await getExecutionLogs(db, userId, filters);

        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get monitor logs';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
