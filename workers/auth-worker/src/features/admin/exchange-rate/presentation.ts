import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { getPrimaryAdminIdentifier } from '../admin-identifier';
import { UpsertExchangeRateSchema } from './domain';
import { createExchangeRateInfrastructure } from './infrastructure';

export function createExchangeRateRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/list', async (c) => {
    try {
      requireAdmin(c);
      const adminStub = getIdFromName(
        c,
        getPrimaryAdminIdentifier(c.env),
        bindingName,
      ) as DurableObjectStub<UserDO>;
      const items = await createExchangeRateInfrastructure(adminStub).list();
      return c.json({ items });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list exchange rates');
      return c.json(errorResponse, status);
    }
  });

  app.put('/daily', async (c) => {
    try {
      requireAdmin(c);
      const body = await c.req.json();
      const data = UpsertExchangeRateSchema.parse(body);
      const adminStub = getIdFromName(
        c,
        getPrimaryAdminIdentifier(c.env),
        bindingName,
      ) as DurableObjectStub<UserDO>;
      const saved = await createExchangeRateInfrastructure(adminStub).upsert(data);
      return c.json({ data: saved });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to save exchange rate');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
