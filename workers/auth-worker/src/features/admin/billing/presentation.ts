import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { AdminGrantPlanSchema, grantAdminPlan } from '../../member/paypal/subscriptions';
import { confirmCoeffProposal, dismissCoeffProposal, getContributionReport, scanContributionAndPropose } from './scan';
import {
  getUserEconomicsReport,
  parseEconomicsHours,
  UserEconomicsNotFoundError,
} from './user-economics';

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

  return app;
}
