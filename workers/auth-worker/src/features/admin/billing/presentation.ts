import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { AdminGrantPlanSchema, grantAdminPlan } from '../../member/paypal/subscriptions';
import { ensurePaypalCatalog } from '../../member/paypal/catalog-bootstrap';
import { expireCreditLotsForAllUsers } from '../../member/workflows/billing/expire-lots';
import { confirmCoeffProposal, dismissCoeffProposal, getContributionReport, scanContributionAndPropose } from './scan';
import { confirmInfraBufferProposal, dismissInfraBufferProposal } from '../cloudflare-usage/infra-buffer.js';
import { CloudflareUsageError } from '../cloudflare-usage/domain.js';
import {
  getUserEconomicsReport,
  parseEconomicsHours,
  UserEconomicsNotFoundError,
} from './user-economics';
import { getExecutionUsagesReport } from './execution-usages';

export function createAdminBillingRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/contribution', async (c) => {
    try {
      requireAdmin(c);
      const hours = Math.min(720, Math.max(1, Number(c.req.query('hours') ?? 24) || 24));
      const data = await getContributionReport(c.env, hours);
      return c.json(data);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to load contribution');
      return c.json(errorResponse, status);
    }
  });

  app.get('/user-economics', async (c) => {
    try {
      requireAdmin(c);
      const hours = parseEconomicsHours(c.req.query('hours'));
      const email = c.req.query('email');
      const data = await getUserEconomicsReport(c.env, { email, hours });
      return c.json(data);
    } catch (e) {
      if (e instanceof UserEconomicsNotFoundError) {
        return c.json({ error: e.message }, 404);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load user economics');
      return c.json(errorResponse, status);
    }
  });

  app.get('/workflow-execution-usages', async (c) => {
    try {
      requireAdmin(c);
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const executionKey = c.req.query('executionKey')?.trim();
      const userId = c.req.query('userId')?.trim();
      const workflowIdRaw = c.req.query('workflowId');
      const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
      const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);
      const dateFrom = c.req.query('dateFrom');
      const dateTo = c.req.query('dateTo');

      const data = await getExecutionUsagesReport(db, {
        executionKey: executionKey || undefined,
        userId: userId || undefined,
        workflowId: workflowIdRaw && /^\d+$/.test(workflowIdRaw) ? parseInt(workflowIdRaw, 10) : undefined,
        limit,
        offset,
        dateFrom: dateFrom && !isNaN(parseInt(dateFrom, 10)) ? parseInt(dateFrom, 10) : undefined,
        dateTo: dateTo && !isNaN(parseInt(dateTo, 10)) ? parseInt(dateTo, 10) : undefined,
      });
      return c.json(data);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to load execution usages');
      return c.json(errorResponse, status);
    }
  });

  app.post('/credit-lots/expire', async (c) => {
    try {
      requireAdmin(c);
      const result = await expireCreditLotsForAllUsers(c.env);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to expire credit lots');
      return c.json(errorResponse, status);
    }
  });

  app.post('/contribution/scan', async (c) => {
    try {
      requireAdmin(c);
      const result = await scanContributionAndPropose(c.env);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to scan contribution');
      return c.json(errorResponse, status);
    }
  });

  app.post('/contribution/proposals/:id/confirm', async (c) => {
    try {
      requireAdmin(c);
      const row = await confirmCoeffProposal(c.env, c.req.param('id'));
      return c.json(row);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to confirm proposal');
      return c.json(errorResponse, status);
    }
  });

  app.post('/contribution/proposals/:id/dismiss', async (c) => {
    try {
      requireAdmin(c);
      const row = await dismissCoeffProposal(c.env, c.req.param('id'));
      return c.json(row);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to dismiss proposal');
      return c.json(errorResponse, status);
    }
  });

  app.post('/contribution/infra-buffer/confirm', async (c) => {
    try {
      const user = requireAdmin(c);
      let body: { confirm?: boolean } = {};
      try {
        body = (await c.req.json()) as { confirm?: boolean };
      } catch {
        body = {};
      }
      if (body.confirm !== true) {
        throw new CloudflareUsageError('apply_confirm_required', 'Pass { confirm: true } to apply infra_buffer', 400);
      }
      const proposal = await confirmInfraBufferProposal(c.env, String(user.identifier ?? 'admin'));
      return c.json({ success: true, proposal });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json({ error: e.message, code: e.code }, e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to confirm infra_buffer');
      return c.json(errorResponse, status);
    }
  });

  app.post('/contribution/infra-buffer/dismiss', async (c) => {
    try {
      requireAdmin(c);
      const proposal = await dismissInfraBufferProposal(c.env);
      return c.json({ success: true, proposal });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json({ error: e.message, code: e.code }, e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to dismiss infra_buffer');
      return c.json(errorResponse, status);
    }
  });

  app.put('/users/:id/plan', async (c) => {
    try {
      requireAdmin(c);
      const identifier = decodeURIComponent(c.req.param('id'));
      const body = AdminGrantPlanSchema.parse(await c.req.json());
      const userDO = getIdFromName(c, identifier, 'USER_DO') as DurableObjectStub<UserDO>;
      const snap = await grantAdminPlan({ userDO, planId: body.planId, reason: body.reason });
      return c.json(snap);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to grant plan');
      return c.json(errorResponse, status);
    }
  });

  app.post('/paypal/catalog', async (c) => {
    try {
      requireAdmin(c);
      const map = await ensurePaypalCatalog(c.env);
      return c.json({ success: true, plans: map });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to bootstrap PayPal catalog');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
