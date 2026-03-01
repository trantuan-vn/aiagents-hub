import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { handleError } from '../../../shared/utils';
import { getOverviewData } from './infrastructure';

export function createOverviewRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/', async (c: any) => {
    try {
      const user = requireAuth(c);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const data = await getOverviewData(userDO);
      return c.json(data);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get overview data');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
