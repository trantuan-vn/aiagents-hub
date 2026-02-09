import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { createAccountApplicationService } from './application';
import { requireAuth } from '../auth/authMiddleware';
import { handleError } from '../../shared/utils';

export function createAccountRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: (c: any, user: any) => Promise<any>, errorMessage: string) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  app.get('/sessions', createRouteHandler(async (c: any, user: any) => {
    const sessionId = getCookie(c, 'sessionId');
    const accountService = createAccountApplicationService(c, bindingName);
    const result = await accountService.listSessionsUseCase(user.identifier, sessionId);
    return c.json(result.sessions);
  }, 'Failed to list sessions'));

  app.post('/sessions/:sessionId/revoke', createRouteHandler(async (c: any, user: any) => {
    const sessionId = c.req.param('sessionId');
    if (!sessionId) throw new Error('Session ID required');
    const accountService = createAccountApplicationService(c, bindingName);
    await accountService.revokeSessionUseCase(user.identifier, sessionId);
    return c.json({ ok: true });
  }, 'Failed to revoke session'));

  return app;
}
