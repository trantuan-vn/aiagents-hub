import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { createWorkflowNodeApplicationService } from './application';

export function createWorkflowNodeRoutes(_bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (
    handler: (c: any, user: any) => Promise<Response>,
    errorMessage: string,
    adminOnly = false,
  ) => {
    return async (c: any) => {
      try {
        const user = adminOnly ? requireAdmin(c) : requireAuth(c);
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  app.get(
    '/',
    createRouteHandler(async (c) => {
      const service = createWorkflowNodeApplicationService(c.env);
      const registry = await service.getRegistry();
      return c.json(registry);
    }, 'Failed to get workflow node registry', false),
  );

  app.post(
    '/',
    createRouteHandler(async (c) => {
      const body = await c.req.json();
      const service = createWorkflowNodeApplicationService(c.env);
      const result = await service.createNode(body);
      return c.json(result, 201);
    }, 'Failed to create workflow node', true),
  );

  app.put(
    '/:id',
    createRouteHandler(async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const service = createWorkflowNodeApplicationService(c.env);
      const result = await service.updateNode(id, body);
      return c.json(result);
    }, 'Failed to update workflow node', true),
  );

  app.delete(
    '/:id',
    createRouteHandler(async (c) => {
      const id = c.req.param('id');
      const service = createWorkflowNodeApplicationService(c.env);
      await service.deleteNode(id);
      return c.json({ success: true });
    }, 'Failed to delete workflow node', true),
  );

  return app;
}
