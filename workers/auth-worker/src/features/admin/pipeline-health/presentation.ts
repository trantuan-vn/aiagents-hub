import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { PipelineHealthError, parseTimeRange } from './domain.js';
import {
  getCronRuns,
  getHotUsers,
  getOverview,
  getTables,
  incidentDetail,
  listInbox,
  listRecommendations,
  probeUser,
  refreshOverview,
  updateIncident,
} from './infrastructure.js';
import { forceFlushUser, rerunPipeline } from './actions.js';

function errBody(e: PipelineHealthError) {
  return { error: e.message, code: e.code };
}

export function createAdminPipelineHealthRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/overview', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await getOverview(c.env, range));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load pipeline health');
      return c.json(errorResponse, status);
    }
  });

  app.get('/incidents', async (c) => {
    try {
      requireAdmin(c);
      return c.json(
        await listInbox(c.env, {
          range: c.req.query('range') ?? undefined,
          stage: c.req.query('stage') ?? undefined,
          status: c.req.query('status') ?? undefined,
          severity: c.req.query('severity') ?? undefined,
        }),
      );
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load incidents');
      return c.json(errorResponse, status);
    }
  });

  app.get('/incidents/:fingerprint', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await incidentDetail(c.env, c.req.param('fingerprint')));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load incident');
      return c.json(errorResponse, status);
    }
  });

  app.patch('/incidents/:fingerprint', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as { status?: string; note?: string };
      return c.json(
        await updateIncident(c.env, c.req.param('fingerprint'), String(user.identifier ?? 'admin'), body),
      );
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to update incident');
      return c.json(errorResponse, status);
    }
  });

  app.get('/recommendations', async (c) => {
    try {
      requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await listRecommendations(c.env, range));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load recommendations');
      return c.json(errorResponse, status);
    }
  });

  app.get('/tables', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await getTables(c.env));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load tables');
      return c.json(errorResponse, status);
    }
  });

  app.get('/cron-runs', async (c) => {
    try {
      requireAdmin(c);
      const limit = Number(c.req.query('limit') ?? 30);
      return c.json(await getCronRuns(c.env, Number.isFinite(limit) ? limit : 30));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load cron runs');
      return c.json(errorResponse, status);
    }
  });

  app.get('/hot-users', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await getHotUsers(c.env));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load hot users');
      return c.json(errorResponse, status);
    }
  });

  app.get('/users/:userId', async (c) => {
    try {
      const user = requireAdmin(c);
      return c.json(await probeUser(c.env, c.req.param('userId'), String(user.identifier ?? 'admin')));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to probe UserDO');
      return c.json(errorResponse, status);
    }
  });

  app.post('/refresh', async (c) => {
    try {
      const user = requireAdmin(c);
      const range = parseTimeRange(c.req.query('range'));
      return c.json(await refreshOverview(c.env, String(user.identifier ?? 'admin'), range));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to refresh pipeline health');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/force-flush', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        userId?: string;
        table?: string;
        confirm?: boolean;
        force?: boolean;
      };
      return c.json(await forceFlushUser(c.env, String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to force flush');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/rerun-pipeline', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        table?: string;
        all?: boolean;
        confirm?: boolean;
      };
      return c.json(await rerunPipeline(c.env, String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to re-run pipeline');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
