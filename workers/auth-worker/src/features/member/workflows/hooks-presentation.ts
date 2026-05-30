import { Hono } from 'hono';

import { handleErrorWithoutIp } from '../../../shared/utils';
import {
  formatChannelInput,
  parseChannelPayload,
  type ChannelType,
} from './channel-hooks.js';
import { findChannelTrigger, findWebhookTrigger, runTrigger } from './triggers.js';

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
        // Slack URL verification
        const challenge = (rawBody as { challenge?: string } | null)?.challenge;
        if (channel === 'slack' && challenge) {
          return c.json({ challenge });
        }
        // Discord PING
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
