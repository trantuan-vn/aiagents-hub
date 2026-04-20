import { tool } from 'ai';
import { z } from 'zod';

import { getServiceUsageAnalytics, type AnalyticsDuration } from '../../monitor/analytics/infrastructure';

const GetMonitorAnalyticsInputSchema = z.object({
  duration: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
});

export function getMonitorAnalyticsTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay du lieu monitor analytics cua user theo khoang thoi gian.',
    inputSchema: GetMonitorAnalyticsInputSchema,
    async *execute(input: z.infer<typeof GetMonitorAnalyticsInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const db = c.env.D1DB;
        if (!db) {
          throw new Error('D1 database binding not configured');
        }

        const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();
        const result = await getServiceUsageAnalytics(db, userId, input.duration as AnalyticsDuration);

        yield {
          state: 'ready' as const,
          ok: true,
          body: {
            ...result,
            duration: input.duration,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get monitor analytics';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
