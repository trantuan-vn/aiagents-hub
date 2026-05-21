import { Hono } from 'hono';
import { z } from 'zod';

import { requireAuth } from '../../auth/authMiddleware';
import { handleError, getIdFromName, executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  AgentWorkflowSchema,
  WorkflowCommentSchema,
  WorkflowUserStarSchema,
} from './domain';
import { executeWorkflowGraph } from './executor.js';
import {
  getWorkflowCommentsFromD1,
  getWorkflowCommunityStarStats,
  getWorkflowRoyaltyStats,
  getWorkflowUserStarFromD1,
  listSharedWorkflowsFromD1,
  listWorkflowRoyalties,
} from './infrastructure';
import { resolveWorkflow } from './workflow-context.js';
import { createWorkflowChatStreamResponse } from './workflow-chat.js';

const CreateWorkflowSchema = AgentWorkflowSchema;
const UpdateWorkflowSchema = AgentWorkflowSchema.partial();

const ExecuteBodySchema = z.object({
  input: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  autoApproveHumanReview: z.boolean().optional(),
});

export function createWorkflowRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: Function, errorMessage: string) => {
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

  const getUserDO = (c: any, identifier: string) =>
    getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;

  const getUserId = (c: any, identifier: string) =>
    (c.env[bindingName] as DurableObjectNamespace).idFromName(identifier).toString();

  const runExecute = async (
    c: any,
    user: any,
    workflowId: number,
    ownerIdParam?: string,
  ) => {
    const body = ExecuteBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const resolved = await resolveWorkflow(
      c,
      bindingName,
      user.identifier,
      workflowId,
      ownerIdParam,
    );
    return executeWorkflowGraph({
      c,
      bindingName,
      user,
      resolved,
      input: body.input,
      variables: body.variables,
      autoApproveHumanReview: body.autoApproveHumanReview ?? false,
      requestMeta: {
        userAgent: c.req.header('user-agent'),
        ipAddress: c.req.header('cf-connecting-ip') ?? undefined,
      },
    });
  };

  const runChat = async (
    c: any,
    user: any,
    workflowId: number,
    ownerIdParam?: string,
  ) => {
    const body = await c.req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages)) {
      return c.json({ error: 'Expected { messages: UIMessage[] }' }, 400);
    }
    const resolved = await resolveWorkflow(
      c,
      bindingName,
      user.identifier,
      workflowId,
      ownerIdParam,
    );
    return createWorkflowChatStreamResponse(
      c,
      bindingName,
      user,
      resolved,
      messages,
    );
  };

  // --- My workflows ---
  app.get(
    '/',
    createRouteHandler(async (c: any, user: any) => {
      const userDO = getUserDO(c, user.identifier);
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'updated_at', direction: 'DESC' },
      }, 'agent_workflows');
      return c.json({ workflows: rows ?? [] });
    }, 'Failed to list workflows'),
  );

  app.post(
    '/',
    createRouteHandler(async (c: any, user: any) => {
      const body = CreateWorkflowSchema.parse(await c.req.json());
      const userDO = getUserDO(c, user.identifier);
      const created = await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        body,
        'agent_workflows',
      );
      return c.json({ workflow: created }, 201);
    }, 'Failed to create workflow'),
  );

  app.get(
    '/shared',
    createRouteHandler(async (c: any, user: any) => {
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const starCount = c.req.query('starCount');
      const search = c.req.query('search');
      const { workflows, hasMore } = await listSharedWorkflowsFromD1(db, {
        limit,
        offset,
        excludeOwnerId: getUserId(c, user.identifier),
        search: search || undefined,
        starCount: starCount ? parseInt(starCount, 10) : undefined,
      });
      return c.json({ workflows, hasMore });
    }, 'Failed to list shared workflows'),
  );

  app.get(
    '/earnings/stats',
    createRouteHandler(async (c: any, user: any) => {
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const period = c.req.query('period') || '30';
      const days = Math.min(90, Math.max(7, parseInt(period, 10) || 30));
      const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
      const ownerId = getUserId(c, user.identifier);
      const { byDay, totalAmount } = await getWorkflowRoyaltyStats(db, ownerId, fromTs);
      return c.json({ byDay, totalAmount, period: days });
    }, 'Failed to get earnings stats'),
  );

  app.get(
    '/earnings',
    createRouteHandler(async (c: any, user: any) => {
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const period = c.req.query('period') || '30';
      const days = Math.min(365, Math.max(1, parseInt(period, 10) || 30));
      const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
      const ownerId = getUserId(c, user.identifier);
      const royalties = await listWorkflowRoyalties(db, ownerId, fromTs, limit, offset);
      return c.json({ royalties, period: days });
    }, 'Failed to list earnings'),
  );

  // Chat & execute (before generic :id routes that might conflict — these are more specific paths below)

  app.post(
    '/:id/chat',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const ownerId = c.req.query('ownerId') || undefined;
      return runChat(c, user, id, ownerId);
    }, 'Failed to process workflow chat'),
  );

  app.post(
    '/:id/execute',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const ownerId = c.req.query('ownerId') || undefined;
      const result = await runExecute(c, user, id, ownerId);
      return c.json(result);
    }, 'Failed to execute workflow'),
  );

  app.get(
    '/:id',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const userDO = getUserDO(c, user.identifier);
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'id', operator: '=', value: id },
      }, 'agent_workflows');
      const wf = Array.isArray(rows) ? rows[0] : rows;
      if (!wf) return c.json({ error: 'Not found' }, 404);
      return c.json({ workflow: wf });
    }, 'Failed to get workflow'),
  );

  app.put(
    '/:id',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const body = UpdateWorkflowSchema.parse(await c.req.json());
      if (body.isShared === true) {
        body.status = 'published';
      }
      const userDO = getUserDO(c, user.identifier);
      const updated = await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id, ...body },
        'agent_workflows',
      );
      return c.json({ workflow: updated });
    }, 'Failed to update workflow'),
  );

  app.delete(
    '/:id',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const userDO = getUserDO(c, user.identifier);
      await executeUtils.executeDynamicAction(
        userDO,
        'delete',
        { id },
        'agent_workflows',
      );
      return c.json({ success: true });
    }, 'Failed to delete workflow'),
  );

  // --- Shared workflow by owner ---
  app.post(
    '/shared/:ownerId/:workflowId/execute',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const result = await runExecute(c, user, workflowId, ownerId);
      return c.json(result);
    }, 'Failed to execute shared workflow'),
  );

  app.post(
    '/shared/:ownerId/:workflowId/chat',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      return runChat(c, user, workflowId, ownerId);
    }, 'Failed to process shared workflow chat'),
  );

  app.get(
    '/shared/:ownerId/:workflowId',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const sql = `SELECT id, globalId, user_id, name, description, slug, definition, starCount, starLabel, usageCount, totalEarningsVnd, status, created_at
        FROM agent_workflows WHERE user_id = ? AND id = ? AND isShared = 1 LIMIT 1`;
      const result = await db.prepare(sql).bind(ownerId, workflowId).first();
      if (!result) return c.json({ error: 'Not found' }, 404);
      const starStats = await getWorkflowCommunityStarStats(db, ownerId, workflowId);
      return c.json({ workflow: { ...result, ...starStats } });
    }, 'Failed to get shared workflow'),
  );

  app.get(
    '/shared/:ownerId/:workflowId/comments',
    createRouteHandler(async (c: any, _user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const { comments, hasMore } = await getWorkflowCommentsFromD1(
        db,
        ownerId,
        workflowId,
        limit,
        offset,
      );
      return c.json({ comments, hasMore });
    }, 'Failed to list comments'),
  );

  app.post(
    '/shared/:ownerId/:workflowId/comments',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const body = WorkflowCommentSchema.omit({ workflowOwnerId: true, workflowId: true })
        .extend({
          content: z.string().min(1).max(2000),
          rating: z.number().int().min(1).max(5).optional(),
          authorDisplayName: z.string().max(200).optional(),
        })
        .parse(await c.req.json());
      const userDO = getUserDO(c, user.identifier);
      const created = await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        {
          workflowOwnerId: ownerId,
          workflowId,
          ...body,
          queueStatus: 'pending',
        },
        'workflow_comments',
      );
      return c.json({ comment: created }, 201);
    }, 'Failed to post comment'),
  );

  app.get(
    '/shared/:ownerId/:workflowId/star',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const workflowKey = `${ownerId}:${workflowId}`;
      const consumerUserId = getUserId(c, user.identifier);
      const userDO = getUserDO(c, user.identifier);
      const pending = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'workflowKey', operator: '=', value: workflowKey },
      }, 'workflow_user_stars');
      const pendingRow = Array.isArray(pending) ? pending[0] : pending;
      if (pendingRow) {
        return c.json({
          star: { starCount: pendingRow.starCount, label: pendingRow.label },
        });
      }
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const d1Row = await getWorkflowUserStarFromD1(db, consumerUserId, workflowKey);
      return c.json({
        star: d1Row
          ? { starCount: d1Row.starCount, label: d1Row.label }
          : null,
      });
    }, 'Failed to get star'),
  );

  app.put(
    '/shared/:ownerId/:workflowId/star',
    createRouteHandler(async (c: any, user: any) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      const ownerId = c.req.param('ownerId');
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const body = WorkflowUserStarSchema.omit({
        workflowKey: true,
        workflowOwnerId: true,
        workflowId: true,
      }).parse(await c.req.json());
      const workflowKey = `${ownerId}:${workflowId}`;
      const userDO = getUserDO(c, user.identifier);
      const existing = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'workflowKey', operator: '=', value: workflowKey },
      }, 'workflow_user_stars');
      const payload = {
        workflowKey,
        workflowOwnerId: ownerId,
        workflowId,
        ...body,
        queueStatus: 'pending',
      };
      if (Array.isArray(existing) && existing.length > 0) {
        const updated = await executeUtils.executeDynamicAction(
          userDO,
          'update',
          { id: existing[0].id, ...payload },
          'workflow_user_stars',
        );
        return c.json({ star: updated });
      }
      const created = await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        payload,
        'workflow_user_stars',
      );
      return c.json({ star: created });
    }, 'Failed to save star'),
  );

  return app;
}
