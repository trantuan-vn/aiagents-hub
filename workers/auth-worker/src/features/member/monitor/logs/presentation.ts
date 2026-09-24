import { Hono } from 'hono';
import { requireAuth } from '../../../auth/authMiddleware';
import { handleError } from '../../../../shared/utils';
import { getExecutionLogs, type LogsFilters } from './infrastructure';

const VALID_STATUSES = new Set(['running', 'completed', 'failed', 'pending_human', 'cancelled']);

export function createMonitorLogsRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/', async (c: any) => {
    try {
      const user = requireAuth(c);
      const db = c.env.D1DB;
      if (!db) {
        throw new Error('D1 database binding not configured');
      }
      const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();

      const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const workflowId = c.req.query('workflowId');
      const status = c.req.query('status')?.trim();
      const dateFrom = c.req.query('dateFrom');
      const dateTo = c.req.query('dateTo');

      const filters: LogsFilters = { limit, offset };

      if (workflowId && /^\d+$/.test(workflowId)) {
        filters.workflowId = parseInt(workflowId, 10);
      }
      if (status && VALID_STATUSES.has(status)) {
        filters.status = status;
      }
      if (dateFrom) {
        const ts = parseInt(dateFrom, 10);
        if (!isNaN(ts)) filters.dateFrom = ts;
      }
      if (dateTo) {
        const ts = parseInt(dateTo, 10);
        if (!isNaN(ts)) filters.dateTo = ts;
      }

      const { logs, hasMore, runStats } = await getExecutionLogs(db, userId, filters);

      return c.json({
        logs,
        hasMore,
        runStats,
        /** Back-compat for older clients expecting errorRate shape. */
        errorRate: runStats
          ? {
              total: runStats.total,
              errors: runStats.failed,
              errorRatePercent: runStats.failRatePercent,
            }
          : undefined,
        limit,
        offset,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get workflow run logs');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
