import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { CloudflareLogsError, parseTimeRange } from './domain.js';
import {
  getOverview,
  groupDetail,
  listInbox,
  listRecommendations,
  liveEvents,
  refreshOverview,
  updateGroup,
} from './infrastructure.js';

function logsErrorResponse(e: CloudflareLogsError) {
  return { error: e.message, code: e.code };
}

export function createAdminCloudflareLogsRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/overview', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await getOverview(c.env, range));
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load worker errors');
      return c.json(errorResponse, status);
    }
  });

  app.get('/groups', async (c) => {
    try {
      requireAdmin(c);
      return c.json(
        await listInbox(c.env, {
          range: c.req.query('range') ?? undefined,
          script: c.req.query('script') ?? undefined,
          status: c.req.query('status') ?? undefined,
          severity: c.req.query('severity') ?? undefined,
        }),
      );
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load error inbox');
      return c.json(errorResponse, status);
    }
  });

  app.get('/groups/:fingerprint', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await groupDetail(c.env, c.req.param('fingerprint')));
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load error group');
      return c.json(errorResponse, status);
    }
  });

  app.patch('/groups/:fingerprint', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as { status?: string; note?: string };
      return c.json(await updateGroup(c.env, c.req.param('fingerprint'), String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to update error group');
      return c.json(errorResponse, status);
    }
  });

  app.get('/recommendations', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await listRecommendations(c.env, range));
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load recommendations');
      return c.json(errorResponse, status);
    }
  });

  app.get('/events', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(
        await liveEvents(c.env, {
          range,
          script: c.req.query('script') ?? undefined,
          includeWarn: c.req.query('includeWarn') === '1',
          cursor: c.req.query('cursor') ?? undefined,
        }),
      );
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load live events');
      return c.json(errorResponse, status);
    }
  });

  app.get('/invocations/:id', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range') ?? '7d');
      return c.json(
        await liveEvents(c.env, {
          range,
          invocationId: c.req.param('id'),
        }),
      );
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load invocation');
      return c.json(errorResponse, status);
    }
  });

  app.post('/refresh', async (c) => {
    try {
      const user = requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await refreshOverview(c.env, String(user.identifier ?? 'admin'), range));
    } catch (e) {
      if (e instanceof CloudflareLogsError) return c.json(logsErrorResponse(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to refresh worker errors');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
