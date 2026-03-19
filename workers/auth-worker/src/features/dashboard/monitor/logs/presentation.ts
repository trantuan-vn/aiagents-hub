import { Hono } from 'hono';
import { requireAuth } from '../../../auth/authMiddleware';
import { handleError } from '../../../../shared/utils';
import { getServiceUsageLogs, type LogsFilters } from './infrastructure';

export function createMonitorLogsRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/', async (c: any) => {
    try {
      const user = requireAuth(c);
      const db = c.env.D1DB;
      if (!db) {
        throw new Error('D1 database binding not configured');
      }
      // userId = DO id string (same as user_id in D1, synced from UserDO via queue)
      const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();

      const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const serviceId = c.req.query('serviceId');
      const endpoint = c.req.query('endpoint')?.trim();
      const dateFrom = c.req.query('dateFrom');
      const dateTo = c.req.query('dateTo');

      const filters: LogsFilters = {
        limit,
        offset,
      };

      if (serviceId && /^\d+$/.test(serviceId)) {
        filters.serviceId = parseInt(serviceId, 10);
      }
      if (endpoint) {
        filters.endpoint = endpoint;
      }
      if (dateFrom) {
        const ts = parseInt(dateFrom, 10);
        if (!isNaN(ts)) filters.dateFrom = ts;
      }
      if (dateTo) {
        const ts = parseInt(dateTo, 10);
        if (!isNaN(ts)) filters.dateTo = ts;
      }

      const { logs, hasMore, errorRate } = await getServiceUsageLogs(db, userId, filters);

      return c.json({
        logs,
        hasMore,
        errorRate,
        limit,
        offset,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get service usage logs');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
