import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { AiGatewayLogsError, assertExecutionKey, assertLogId } from './domain.js';
import { getExecutionGatewayLogDetail, getExecutionGatewayReport } from './report.js';

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw == null || raw === '') return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

export function createAdminAiGatewayLogsRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/executions/:executionKey/logs/:logId', async (c) => {
    try {
      const user = requireAdmin(c);
      const executionKey = assertExecutionKey(c.req.param('executionKey'));
      const logId = assertLogId(c.req.param('logId'));
      const detail = await getExecutionGatewayLogDetail(
        c.env,
        String(user.identifier ?? 'admin'),
        executionKey,
        logId,
      );
      return c.json(detail);
    } catch (e) {
      if (e instanceof AiGatewayLogsError) {
        return c.json({ error: e.message, code: e.code }, e.status as ContentfulStatusCode);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load AI Gateway log');
      return c.json(errorResponse, status);
    }
  });

  app.get('/executions/:executionKey/logs', async (c) => {
    try {
      const user = requireAdmin(c);
      const executionKey = assertExecutionKey(c.req.param('executionKey'));
      const pageRaw = c.req.query('page');
      const page = pageRaw ? Number(pageRaw) : 1;
      const report = await getExecutionGatewayReport(
        c.env,
        String(user.identifier ?? 'admin'),
        executionKey,
        {
          page: Number.isFinite(page) ? page : 1,
          success: parseBool(c.req.query('success')),
          cached: parseBool(c.req.query('cached')),
          model: c.req.query('model'),
          search: c.req.query('search'),
        },
      );
      return c.json(report);
    } catch (e) {
      if (e instanceof AiGatewayLogsError) {
        return c.json({ error: e.message, code: e.code }, e.status as ContentfulStatusCode);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load AI Gateway logs');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
