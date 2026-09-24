import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { PipelineHealthError, parseTimeRange } from './domain.js';
import {
  getAuxBucketHealth,
  getCronRuns,
  getDlqInbox,
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
import { forceFlushUser, replayDlqEntry, rerunPipeline, clearSyncPauseUser, setSyncPauseTables, setSyncPauseUser } from './actions.js';
import { getSyncPauseStatus } from '../../ws/infrastructure/sync-pause.js';

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

  app.get('/sync-pause', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await getSyncPauseStatus(c.env));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load sync pause status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/pause-tables', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as { tables?: string[]; confirm?: boolean };
      return c.json(await setSyncPauseTables(c.env, String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to set pause tables');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/pause-user', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        userId?: string;
        reason?: string;
        ttlSec?: number;
        confirm?: boolean;
      };
      return c.json(await setSyncPauseUser(c.env, String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to pause user sync');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/resume-user', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as { userId?: string; confirm?: boolean };
      return c.json(await clearSyncPauseUser(c.env, String(user.identifier ?? 'admin'), body));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to resume user sync');
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

  app.get('/dlq', async (c) => {
    try {
      requireAdmin(c);
      const limit = Number(c.req.query('limit') ?? 50);
      return c.json(
        await getDlqInbox(c.env, {
          status: c.req.query('status') ?? undefined,
          limit: Number.isFinite(limit) ? limit : 50,
        }),
      );
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to load DLQ entries');
      return c.json(errorResponse, status);
    }
  });

  app.post('/actions/replay-dlq', async (c) => {
    try {
      const user = requireAdmin(c);
      const body = (await c.req.json().catch(() => ({}))) as { id?: number; confirm?: boolean };
      return c.json(
        await replayDlqEntry(c.env, String(user.identifier ?? 'admin'), {
          id: Number(body.id),
          confirm: body.confirm,
        }),
      );
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to replay DLQ entry');
      return c.json(errorResponse, status);
    }
  });

  app.get('/aux-buckets', async (c) => {
    try {
      requireAdmin(c);
      return c.json(await getAuxBucketHealth(c.env));
    } catch (e) {
      if (e instanceof PipelineHealthError) return c.json(errBody(e), e.status);
      const { errorResponse, status } = await handleError(c, e, 'Failed to probe aux R2 buckets');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
