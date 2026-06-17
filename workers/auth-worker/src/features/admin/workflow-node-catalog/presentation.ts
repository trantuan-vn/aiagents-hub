import { Hono } from 'hono';

import { requireAdmin, requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import {
  listWorkflowNodeCatalog,
  syncWorkflowNodeCatalogFromSeeds,
  updateWorkflowNodeCatalogActive,
} from './store';

export function createWorkflowNodeCatalogAdminRoutes(_bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const adminHandler = (
    handler: (c: any) => Promise<Response>,
    errorMessage: string,
  ) => {
    return async (c: any) => {
      try {
        requireAdmin(c);
        return await handler(c);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  app.get(
    '/',
    adminHandler(async (c) => {
      const db = c.env.D1DB;
      const entries = await listWorkflowNodeCatalog(db);
      return c.json({ entries });
    }, 'Failed to list workflow node catalog'),
  );

  app.post(
    '/sync',
    adminHandler(async (c) => {
      const db = c.env.D1DB;
      const count = await syncWorkflowNodeCatalogFromSeeds(db);
      const entries = await listWorkflowNodeCatalog(db);
      return c.json({ synced: count, entries });
    }, 'Failed to sync workflow node catalog'),
  );

  app.patch(
    '/:id',
    adminHandler(async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));
      const isActive = Boolean(body?.isActive);
      const db = c.env.D1DB;
      const entry = await updateWorkflowNodeCatalogActive(db, id, isActive);
      if (!entry) return c.json({ error: 'Catalog entry not found' }, 404);
      return c.json({ entry });
    }, 'Failed to update workflow node catalog entry'),
  );

  return app;
}

export function createWorkflowNodeCatalogMemberRoutes(_bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/', async (c) => {
    try {
      requireAuth(c);
      const db = c.env.D1DB;
      const entries = await listWorkflowNodeCatalog(db);
      return c.json({ entries });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list node catalog');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
