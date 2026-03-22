import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { getAdminCrmStats } from './infrastructure';

export function createAdminCrmRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/', async (c: any) => {
    try {
      requireAdmin(c);
      const db = c.env.D1DB;
      if (!db) {
        return c.json({ error: 'D1 database binding not configured' }, 500);
      }
      const data = await getAdminCrmStats(db);
      return c.json(data);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get admin CRM stats');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
