import { tool } from 'ai';
import { z } from 'zod';

import { getServiceUsageLogs, type LogsFilters } from '../../monitor/logs/infrastructure';

const GetMonitorLogsInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  serviceId: z.number().int().positive().optional(),
  endpoint: z.string().trim().min(1).optional(),
  dateFrom: z.number().int().nonnegative().optional(),
  dateTo: z.number().int().nonnegative().optional(),
});

export function getMonitorLogsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay danh sach logs monitor cua user theo bo loc va phan trang.',
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
          serviceId: input.serviceId,
          endpoint: input.endpoint,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        };
        const result = await getServiceUsageLogs(db, userId, filters);

        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get monitor logs';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
