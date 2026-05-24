import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { getDefaultTierConfigs } from './domain';

export function createMembershipTierRoutes(_bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const adminHandler = (handler: (c: any) => Promise<Response>, errorMessage: string) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        if (user.role !== 'admin') {
          throw new Error('Insufficient permissions');
        }
        return await handler(c);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  app.get(
    '/configs',
    adminHandler(async (c) => {
      return c.json({ tiers: getDefaultTierConfigs() });
    }, 'Failed to get tier configs'),
  );

  app.get(
    '/members',
    adminHandler(async (c) => {
      const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
      const tierFilter = c.req.query('tier') as string | undefined;

      const db = c.env.D1DB;
      if (!db) {
        throw new Error('D1 database binding not configured');
      }

      let sql = `SELECT identifier, role, membership_tier, monthly_top_up_vnd, tier_period_ym, wallet_balance
        FROM users WHERE role = 'member'`;
      const binds: unknown[] = [];
      if (tierFilter && ['member', 'silver', 'gold', 'diamond'].includes(tierFilter)) {
        sql += ` AND membership_tier = ?`;
        binds.push(tierFilter);
      }
      sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
      binds.push(limit, (page - 1) * limit);

      const result = await db.prepare(sql).bind(...binds).all();
      return c.json({
        members: result.results ?? [],
        page,
        limit,
      });
    }, 'Failed to list members by tier'),
  );

  return app;
}
