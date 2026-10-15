import { Hono } from 'hono';

import { resolveOwnedWorkflow } from './triggers.js';
import { siteSupportReplySeconds } from './site-support.js';

/** Public wait hint for /support. Reads only the configured support workflow. */
export function createPublicSiteSupportRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/site-support', async (c) => {
    const workflowId = Number(String(c.env.SITE_SUPPORT_WORKFLOW_ID ?? '').trim());
    const ownerId = String(c.env.SITE_SUPPORT_OWNER_ID ?? '').trim();
    if (!Number.isFinite(workflowId) || workflowId <= 0 || !ownerId) {
      return c.json({ replyWithinSeconds: null });
    }
    try {
      const resolved = await resolveOwnedWorkflow(c.env, bindingName, ownerId, workflowId);
      if (String(resolved.workflow.status ?? '') !== 'published') {
        return c.json({ replyWithinSeconds: null });
      }
      c.header('Cache-Control', 'no-store');
      return c.json({ replyWithinSeconds: siteSupportReplySeconds(resolved.definition) });
    } catch {
      return c.json({ replyWithinSeconds: null });
    }
  });
  return app;
}
