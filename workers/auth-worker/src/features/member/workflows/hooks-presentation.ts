import { Hono } from 'hono';

import { handleErrorWithoutIp } from '../../../shared/utils';
import {
  formatChannelInput,
  parseChannelPayload,
  type ChannelType,
} from './channel-hooks.js';
import { handleWebhookRequest, handleWebhookRequestByWorkflowId } from './nodes/webhook/trigger.js';
import {
  findChannelTrigger,
  findWebhookTriggerByWorkflowId,
  listWebhookTriggersForWorkflow,
  runTrigger,
  syncWebhookTriggersForWorkflow,
} from './triggers.js';
import { validateWebhookApiToken } from './webhook-auth.js';

/**
 * Public webhook endpoints that fire workflows. Mounted OUTSIDE the
 * authenticated `/dashboard/*` and `/api/*` namespaces.
 *
 * Workflow webhooks use `/hooks/workflows/:workflowId/:path` (one path per
 * webhook node) with Bearer API token auth (X-Client-ID + Authorization).
 */
export function createWorkflowHookRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const workflowHandler = async (c: any) => {
    try {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      if (isNaN(workflowId)) return c.json({ error: 'Invalid workflow id' }, 400);

      const webhookPathRaw = c.req.param('webhookPath');
      const webhookPath = webhookPathRaw
        ? decodeURIComponent(webhookPathRaw).trim().replace(/^\/+/, '')
        : undefined;

      const clientId = c.req.header('X-Client-ID') || c.req.query('client_id');
      if (!clientId) return c.json({ error: 'Missing X-Client-ID header' }, 401);

      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const auth = await validateWebhookApiToken(c, bindingName, clientId);

      await syncWebhookTriggersForWorkflow(c.env, bindingName, db, clientId, workflowId);

      const trigger = await findWebhookTriggerByWorkflowId(
        db,
        workflowId,
        clientId,
        webhookPath,
      );
      if (!trigger) {
        const count = (await listWebhookTriggersForWorkflow(db, workflowId, clientId)).length;
        if (count > 1 && !webhookPath) {
          return c.json(
            {
              error:
                'Multiple webhooks in this workflow — use /hooks/workflows/:workflowId/:webhookPath',
            },
            400,
          );
        }
        return c.json({ error: 'Webhook not found' }, 404);
      }

      const result = await handleWebhookRequestByWorkflowId(
        c.env,
        bindingName,
        db,
        workflowId,
        clientId,
        webhookPath,
        c.req.raw,
        auth,
      );
      if (result.notFound) return c.json({ error: 'Webhook not found' }, 404);

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

  app.post('/workflows/:workflowId/:webhookPath', workflowHandler);
  app.get('/workflows/:workflowId/:webhookPath', workflowHandler);
  app.post('/workflows/:workflowId', workflowHandler);
  app.get('/workflows/:workflowId', workflowHandler);

  /** Legacy URL shape — kept for backward compatibility during migration. */
  const legacyHandler = async (c: any) => {
    try {
      const ownerId = c.req.param('ownerId');
      const token = c.req.param('token');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const result = await handleWebhookRequest(
        c.env,
        bindingName,
        db,
        ownerId,
        token,
        c.req.raw,
      );
      if (result.notFound) return c.json({ error: 'Webhook not found' }, 404);

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

  app.post('/workflows/:ownerId/:token', legacyHandler);
  app.get('/workflows/:ownerId/:token', legacyHandler);

  /** OpenClaw-compatible multi-channel hooks (Telegram / Slack / Discord). */
  const channelHandler = (channel: ChannelType) => async (c: any) => {
    try {
      const ownerId = c.req.param('ownerId');
      const token = c.req.param('token');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const rawBody = await c.req.json().catch(() => null);
      const parsed = parseChannelPayload(channel, rawBody);
      if (!parsed) {
        const challenge = (rawBody as { challenge?: string } | null)?.challenge;
        if (channel === 'slack' && challenge) {
          return c.json({ challenge });
        }
        if (channel === 'discord' && (rawBody as { type?: number } | null)?.type === 1) {
          return c.json({ type: 1 });
        }
        return c.json({ ok: true, skipped: true });
      }

      const trigger = await findChannelTrigger(db, ownerId, channel, token);
      if (!trigger) return c.json({ error: 'Channel trigger not found' }, 404);

      const input = formatChannelInput(parsed);
      const result = await runTrigger(c.env, bindingName, trigger, input);
      return c.json({
        status: result.status,
        executionKey: result.executionKey,
        output: result.output,
        channel,
      });
    } catch (e) {
      const { errorResponse, status } = await handleErrorWithoutIp(
        e,
        'Channel webhook execution failed',
        c.env,
      );
      return c.json(errorResponse, status);
    }
  };

  for (const ch of ['telegram', 'slack', 'discord'] as const) {
    app.post(`/channels/${ch}/:ownerId/:token`, channelHandler(ch));
  }

  return app;
}
