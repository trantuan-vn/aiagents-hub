import { Hono } from 'hono';

import { handleErrorWithoutIp } from '../../../shared/utils';
import { findWebhookTrigger, runTrigger } from './triggers.js';

/**
 * Public webhook endpoints that fire workflows. Mounted OUTSIDE the
 * authenticated `/dashboard/*` and `/api/*` namespaces. Authorization is the
 * unguessable per-trigger token embedded in the URL.
 */
export function createWorkflowHookRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const handler = async (c: any) => {
    try {
      const ownerId = c.req.param('ownerId');
      const token = c.req.param('token');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const trigger = await findWebhookTrigger(db, ownerId, token);
      if (!trigger) return c.json({ error: 'Webhook not found' }, 404);

      let input = c.req.query('input') ?? '';
      if (!input) {
        const raw = await c.req.text().catch(() => '');
        input = raw || trigger.input || '';
      }

      const result = await runTrigger(c.env, bindingName, trigger, input);
      return c.json({
        status: result.status,
        executionKey: result.executionKey,
        output: result.output,
      });
    } catch (e) {
      const { errorResponse, status } = await handleErrorWithoutIp(e, 'Webhook execution failed', c.env);
      return c.json(errorResponse, status);
    }
  };

  app.post('/workflows/:ownerId/:token', handler);
  app.get('/workflows/:ownerId/:token', handler);

  return app;
}
