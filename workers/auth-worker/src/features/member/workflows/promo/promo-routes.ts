import type { Hono } from 'hono';

import { executeUtils } from '../../../../shared/utils';
import { shareGrantVisibleTo } from '../domain/share-grants.js';
import { assertPublicSharedOnOwnerDo } from '../../../enterprise/workflow-flag';
import {
  deletePromoSite,
  getPromoSite,
  isPromoOwnerKey,
  normalizePromoUpload,
  putPromoSite,
  type PromoBucket,
} from './promo-site';

type RouteHandler = (
  handler: (c: any, user: any) => Promise<Response>,
  errorMessage: string,
) => (c: any) => Promise<Response>;

function bucketOf(c: any): PromoBucket | undefined {
  return c.env?.R2_VERSION_BUCKET as PromoBucket | undefined;
}

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

export function registerWorkflowPromoRoutes(
  app: Hono<{ Bindings: Env }>,
  deps: {
    createRouteHandler: RouteHandler;
    getUserDO: (c: any, identifier: string) => unknown;
    getUserId: (c: any, identifier: string) => string;
  },
) {
  const { createRouteHandler, getUserDO, getUserId } = deps;

  app.get(
    '/:id/promo-site',
    createRouteHandler(async (c, user) => {
      const id = parseInt(c.req.param('id'), 10);
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Not found' }, 404);
      const wf = await ownedWorkflow(getUserDO, c, user, id);
      if (!wf) return c.json({ error: 'Not found' }, 404);
      const bucket = bucketOf(c);
      if (!bucket) return c.json({ error: 'Storage is not configured' }, 500);
      const ownerId = getUserId(c, user.identifier);
      const site = await getPromoSite(bucket, ownerId, id);
      return c.json({ site });
    }, 'Failed to load showcase'),
  );

  app.put(
    '/:id/promo-site',
    createRouteHandler(async (c, user) => {
      const id = parseInt(c.req.param('id'), 10);
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Not found' }, 404);
      const wf = await ownedWorkflow(getUserDO, c, user, id);
      if (!wf) return c.json({ error: 'Not found' }, 404);
      const bucket = bucketOf(c);
      if (!bucket) return c.json({ error: 'Storage is not configured' }, 500);
      const ownerId = getUserId(c, user.identifier);
      if (!isPromoOwnerKey(ownerId)) return c.json({ error: 'Not found' }, 404);
      const normalized = normalizePromoUpload(await c.req.json().catch(() => null));
      if (!normalized.ok) return c.json({ error: normalized.error }, 400);
      const site = await putPromoSite(bucket, ownerId, id, normalized.files);
      return c.json({
        site: {
          updatedAt: site.updatedAt,
          fileCount: site.files.length,
        },
      });
    }, 'Failed to publish showcase'),
  );

  app.delete(
    '/:id/promo-site',
    createRouteHandler(async (c, user) => {
      const id = parseInt(c.req.param('id'), 10);
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Not found' }, 404);
      const wf = await ownedWorkflow(getUserDO, c, user, id);
      if (!wf) return c.json({ error: 'Not found' }, 404);
      await deletePromoSite(bucketOf(c), getUserId(c, user.identifier), id);
      return c.json({ success: true });
    }, 'Failed to remove showcase'),
  );

  app.get(
    '/shared/:ownerId/:workflowId/promo-site',
    createRouteHandler(async (c, user) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (!Number.isInteger(workflowId) || workflowId <= 0 || !isPromoOwnerKey(ownerId)) {
        return c.json({ error: 'Not found' }, 404);
      }
      const wf = await assertPublicSharedOnOwnerDo(c.env, ownerId, workflowId);
      if (!shareGrantVisibleTo(wf.shareGrants, user.identifier)) return c.json({ error: 'Not found' }, 404);
      const bucket = bucketOf(c);
      if (!bucket) return c.json({ error: 'Storage is not configured' }, 500);
      const site = await getPromoSite(bucket, ownerId, workflowId);
      return c.json({
        site,
        workflow: {
          name: String(wf.name ?? ''),
          description: String(wf.description ?? ''),
        },
      });
    }, 'Failed to load showcase'),
  );
}
