import type { Hono } from 'hono';
import { z } from 'zod';

import { executeUtils } from '../../../../shared/utils';
import { deliverShareInvites, type ShareInviteCode } from './deliver.js';

type RouteHandler = (
  handler: (c: any, user: any) => Promise<Response>,
  errorMessage: string,
) => (c: any) => Promise<Response>;

const BodySchema = z.object({
  emails: z.array(z.string()).min(1).max(30),
  language: z.enum(['vi', 'en']).optional(),
});

const STATUS: Record<ShareInviteCode, number> = {
  SHARE_INVITE_UNSAVED: 409,
  SHARE_INVITE_NOT_LIVE: 409,
  SHARE_INVITE_NO_TRIGGERS: 400,
  SHARE_INVITE_EMPTY: 400,
  SHARE_INVITE_RATE: 429,
  SHARE_INVITE_FAILED: 502,
};

async function ownedWorkflow(
  getUserDO: (c: any, identifier: string) => unknown,
  c: any,
  user: any,
  id: number,
): Promise<Record<string, unknown> | null> {
  const rows = await executeUtils.executeDynamicAction(
    getUserDO(c, user.identifier) as any,
    'select',
    { where: { field: 'id', operator: '=', value: id } },
    'agent_workflows',
  );
  const wf = Array.isArray(rows) ? rows[0] : rows;
  return wf ? (wf as Record<string, unknown>) : null;
}

export function registerShareInviteRoutes(
  app: Hono<{ Bindings: Env }>,
  deps: {
    createRouteHandler: RouteHandler;
    getUserDO: (c: any, identifier: string) => unknown;
    getUserId: (c: any, identifier: string) => string;
  },
) {
  const { createRouteHandler, getUserDO, getUserId } = deps;

  app.post(
    '/:id/share-invites',
    createRouteHandler(async (c, user) => {
      const id = parseInt(c.req.param('id'), 10);
      if (!Number.isFinite(id)) return c.json({ error: 'Invalid workflow', code: 'SHARE_INVITE_EMPTY' }, 400);
      const parsed = BodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Invalid request', code: 'SHARE_INVITE_EMPTY' }, 400);

      const workflow = await ownedWorkflow(getUserDO, c, user, id);
      if (!workflow) return c.json({ error: 'Not found', code: 'SHARE_INVITE_NOT_LIVE' }, 404);

      const result = await deliverShareInvites({
        env: c.env,
        workflow,
        workflowId: id,
        ownerId: getUserId(c, user.identifier),
        ownerEmail: String(user.identifier ?? ''),
        emails: parsed.data.emails,
        locale: parsed.data.language ?? 'vi',
      });
      if (!result.ok) {
        return c.json(
          { error: result.code, code: result.code, emails: result.emails },
          STATUS[result.code] as 400 | 409 | 429 | 502,
        );
      }
      return c.json({
        sent: result.sent,
        firstTime: result.firstTime,
        existing: result.existing,
        skipped: result.skipped,
      });
    }, 'Failed to send share invitations'),
  );
}
