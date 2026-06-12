import { Hono } from 'hono';
import { z } from 'zod';

import { requireAuth } from '../../auth/authMiddleware';
import { handleError, getIdFromName, executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  AgentWorkflowSchema,
  WorkflowCommentSchema,
  WorkflowUserStarSchema,
  WorkflowCredentialTypeSchema,
} from './domain';
import { executeWorkflowGraph, resumeWorkflowExecution } from './executor.js';
import { getExecutionByKey, listExecutions } from './execution-store.js';
import { createCredential, deleteCredential, listCredentials } from './credentials.js';
import {
  createTrigger,
  deleteTrigger,
  findWebhookTriggerByNodeId,
  listTriggers,
  syncWebhookTriggersForWorkflow,
  updateTrigger,
  workflowDefinitionHasWebhookTrigger,
} from './triggers.js';
import { WORKFLOW_INTEGRATIONS } from './integrations.js';
import { getVersionByKey, listVersions, snapshotVersion } from './version-store.js';
import { autofixWorkflowDefinition, generateWorkflowDefinition } from './ai-authoring.js';
import { getCollabState, publishCollabState } from './workflow-collab.js';
import {
  buildExecutionObservability,
  computeExecutionStats,
} from './execution-observability.js';
import { isChannelTriggerType } from './triggers.js';
import {
  getWorkflowCommentsFromD1,
  getWorkflowCommunityStarStats,
  getWorkflowRoyaltyStats,
  getWorkflowUserStarFromD1,
  listSharedWorkflowsFromD1,
  listWorkflowRoyalties,
} from './infrastructure';
import { getWorkflowEarningsMonthlySummary } from './earnings-monthly.js';
import { parseWorkflowDefinition, resolveWorkflow } from './workflow-context.js';
import { createWorkflowChatStreamResponse } from './workflow-chat.js';

const CreateWorkflowSchema = AgentWorkflowSchema;
const UpdateWorkflowSchema = AgentWorkflowSchema.partial();

const ExecuteBodySchema = z.object({
  input: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  autoApproveHumanReview: z.boolean().optional(),
});

const ResumeBodySchema = z.object({
  decision: z.enum(['approve', 'reject']).default('approve'),
  note: z.string().max(2000).optional(),
});

const CreateTriggerSchema = z
  .object({
    type: z.enum(['cron', 'webhook', 'telegram', 'slack', 'discord']),
    cronExpr: z.string().min(1).max(120).optional(),
    input: z.string().max(10000).optional(),
    enabled: z.boolean().optional(),
    autoApproveHumanReview: z.boolean().optional(),
    nodeId: z.string().min(1).max(200).optional(),
    webhookPath: z.string().min(1).max(200).optional(),
  })
  .refine((d) => d.type !== 'cron' || !!d.cronExpr, {
    message: 'cronExpr is required for cron triggers',
  });

const UpdateTriggerSchema = z.object({
  enabled: z.boolean().optional(),
  cronExpr: z.string().min(1).max(120).optional(),
  input: z.string().max(10000).optional(),
  autoApproveHumanReview: z.boolean().optional(),
});

const CreateCredentialSchema = z.object({
  name: z.string().min(1).max(120),
  type: WorkflowCredentialTypeSchema,
  secret: z.string().max(8000).optional().default(''),
  meta: z
    .object({
      headerName: z.string().max(120).optional(),
      paramName: z.string().max(120).optional(),
      username: z.string().max(200).optional(),
    })
    .optional(),
});

function parseExecutionRow(row: any) {
  if (!row) return row;
  const safeParse = (v: unknown) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  return {
    ...row,
    output: safeParse(row.output),
    // `state` is the internal engine snapshot; expose only the step trace.
    steps: safeParse(row.state)?.engine?.steps ?? [],
    state: undefined,
  };
}

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
        {
          ...body,
          tags: body.tags ?? '[]',
        },
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
    '/earnings/monthly-summary',
    createRouteHandler(async (c: any, user: any) => {
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const ownerId = getUserId(c, user.identifier);
      const summary = await getWorkflowEarningsMonthlySummary(db, ownerId);
      return c.json(summary);
    }, 'Failed to get monthly workflow earnings'),
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

  // --- Execution history & durable resume ---
  app.get(
    '/:id/executions',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
      const userDO = getUserDO(c, user.identifier);
      const rows = await listExecutions(userDO, id, limit);
      return c.json({ executions: rows.map(parseExecutionRow) });
    }, 'Failed to list executions'),
  );

  app.get(
    '/executions/:executionKey',
    createRouteHandler(async (c: any, user: any) => {
      const executionKey = c.req.param('executionKey');
      const userDO = getUserDO(c, user.identifier);
      const row = await getExecutionByKey(userDO, executionKey);
      if (!row) return c.json({ error: 'Execution not found' }, 404);
      const parsed = parseExecutionRow(row);
      return c.json({
        execution: parsed,
        observability: buildExecutionObservability(row, parsed.steps),
      });
    }, 'Failed to get execution'),
  );

  app.get(
    '/:id/executions/stats',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const limit = Math.min(200, parseInt(c.req.query('limit') || '50', 10));
      const userDO = getUserDO(c, user.identifier);
      const rows = await listExecutions(userDO, id, limit);
      return c.json({ stats: computeExecutionStats(rows) });
    }, 'Failed to get execution stats'),
  );

  // --- Realtime canvas collaboration ---
  app.get(
    '/:id/collab',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const userDO = getUserDO(c, user.identifier);
      const state = await getCollabState(userDO, id);
      return c.json({ state });
    }, 'Failed to get collab state'),
  );

  app.put(
    '/:id/collab',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const body = (await c.req.json()) as {
        definition: string;
        editorId: string;
        editorName?: string;
      };
      if (!body.definition || !body.editorId) {
        return c.json({ error: 'definition and editorId required' }, 400);
      }
      const userDO = getUserDO(c, user.identifier);
      const state = await publishCollabState(userDO, {
        workflowId: id,
        definition: body.definition,
        editorId: body.editorId,
        editorName: body.editorName,
      });
      return c.json({ state });
    }, 'Failed to publish collab state'),
  );

  app.post(
    '/executions/:executionKey/resume',
    createRouteHandler(async (c: any, user: any) => {
      const executionKey = c.req.param('executionKey');
      const body = ResumeBodySchema.parse(await c.req.json().catch(() => ({})));
      const result = await resumeWorkflowExecution({
        c,
        bindingName,
        user,
        executionKey,
        approved: body.decision === 'approve',
        note: body.note,
      });
      return c.json(result);
    }, 'Failed to resume execution'),
  );

  // --- Integration presets catalog ---
  app.get(
    '/integrations',
    createRouteHandler(async (c: any) => {
      return c.json({ integrations: WORKFLOW_INTEGRATIONS });
    }, 'Failed to list integrations'),
  );

  // --- Credential vault (secrets stored encrypted, never returned) ---
  app.get(
    '/credentials',
    createRouteHandler(async (c: any, user: any) => {
      const userDO = getUserDO(c, user.identifier);
      const credentials = await listCredentials(userDO);
      return c.json({ credentials });
    }, 'Failed to list credentials'),
  );

  app.post(
    '/credentials',
    createRouteHandler(async (c: any, user: any) => {
      const body = CreateCredentialSchema.parse(await c.req.json());
      const userDO = getUserDO(c, user.identifier);
      const credential = await createCredential(userDO, c.env, body);
      return c.json({ credential }, 201);
    }, 'Failed to create credential'),
  );

  app.delete(
    '/credentials/:id',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid credential id');
      const userDO = getUserDO(c, user.identifier);
      await deleteCredential(userDO, id);
      return c.json({ success: true });
    }, 'Failed to delete credential'),
  );

  // --- Triggers (cron + webhook + OpenClaw channels) ---
  const buildTriggerUrl = (
    c: any,
    ownerId: string,
    workflowId: number,
    type: string,
    token: string | null,
    webhookPath?: string | null,
  ) => {
    const base = (c.env.BASE_URL as string) || new URL(c.req.url).origin;
    if (type === 'webhook') {
      const pathSeg = webhookPath ? `/${encodeURIComponent(webhookPath)}` : '';
      return `${base}/hooks/workflows/${workflowId}${pathSeg}`;
    }
    if (!token) return undefined;
    if (isChannelTriggerType(type)) return `${base}/hooks/channels/${type}/${ownerId}/${token}`;
    return undefined;
  };

  const enrichTrigger = (
    c: any,
    ownerId: string,
    t: {
      type: string;
      workflowId: number;
      webhookToken: string | null;
      webhookPath?: string | null;
      nodeId?: string | null;
    },
  ) => ({
    ...t,
    webhookUrl: buildTriggerUrl(c, ownerId, t.workflowId, t.type, t.webhookToken, t.webhookPath),
    webhookClientId: t.type === 'webhook' ? ownerId : undefined,
  });

  app.get(
    '/:id/triggers',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const ownerId = getUserId(c, user.identifier);
      const rows = await listTriggers(db, ownerId, id);
      return c.json({
        triggers: rows.map((t) => enrichTrigger(c, ownerId, t)),
      });
    }, 'Failed to list triggers'),
  );

  app.post(
    '/:id/triggers',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const body = CreateTriggerSchema.parse(await c.req.json());
      const ownerId = getUserId(c, user.identifier);
      if (body.type === 'webhook' && body.nodeId) {
        const existing = await findWebhookTriggerByNodeId(db, id, ownerId, body.nodeId);
        if (existing) {
          return c.json(
            { trigger: enrichTrigger(c, ownerId, existing) },
            200,
          );
        }
      }
      const trigger = await createTrigger(db, { ownerId, workflowId: id, ...body });
      return c.json(
        { trigger: enrichTrigger(c, ownerId, trigger) },
        201,
      );
    }, 'Failed to create trigger'),
  );

  app.put(
    '/triggers/:triggerId',
    createRouteHandler(async (c: any, user: any) => {
      const triggerId = c.req.param('triggerId');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const body = UpdateTriggerSchema.parse(await c.req.json());
      const ownerId = getUserId(c, user.identifier);
      const trigger = await updateTrigger(db, ownerId, triggerId, body);
      if (!trigger) return c.json({ error: 'Trigger not found' }, 404);
      return c.json({
        trigger: enrichTrigger(c, ownerId, trigger),
      });
    }, 'Failed to update trigger'),
  );

  app.delete(
    '/triggers/:triggerId',
    createRouteHandler(async (c: any, user: any) => {
      const triggerId = c.req.param('triggerId');
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const ownerId = getUserId(c, user.identifier);
      await deleteTrigger(db, ownerId, triggerId);
      return c.json({ success: true });
    }, 'Failed to delete trigger'),
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
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'id', operator: '=', value: id },
      }, 'agent_workflows');
      const existing = Array.isArray(rows) ? rows[0] : rows;
      const updated = await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id, ...body },
        'agent_workflows',
      );
      const wasPublished = (existing as { status?: string })?.status === 'published';
      const nowPublished =
        body.status === 'published' ||
        (updated as { status?: string })?.status === 'published';
      if (nowPublished && !wasPublished) {
        try {
          const def =
            typeof body.definition === 'string'
              ? body.definition
              : ((updated as { definition?: string })?.definition ?? '{"nodes":[],"edges":[]}');
          await snapshotVersion(userDO, { workflowId: id, definition: def, reason: 'publish' });
        } catch (e) {
          console.error('[workflows] publish snapshot failed:', e);
        }
      }
      if (body.definition !== undefined) {
        try {
          const db = c.env.D1DB;
          const defRaw =
            typeof body.definition === 'string'
              ? body.definition
              : ((updated as { definition?: string })?.definition ?? '{"nodes":[],"edges":[]}');
          const definition = parseWorkflowDefinition(defRaw);
          if (db && workflowDefinitionHasWebhookTrigger(definition)) {
            const ownerId = getUserId(c, user.identifier);
            await syncWebhookTriggersForWorkflow(c.env, bindingName, db, ownerId, id);
          }
        } catch (e) {
          console.error('[workflows] webhook trigger sync failed:', e);
        }
      }
      return c.json({ workflow: updated });
    }, 'Failed to update workflow'),
  );

  // --- AI authoring: text-to-workflow + auto-fix ---
  app.post(
    '/generate',
    createRouteHandler(async (c: any, _user: any) => {
      const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt) return c.json({ error: 'prompt is required' }, 400);
      const result = await generateWorkflowDefinition(c.env, prompt);
      return c.json(result);
    }, 'Failed to generate workflow'),
  );

  app.post(
    '/:id/autofix',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const body = (await c.req.json().catch(() => ({}))) as {
        definition?: unknown;
        error?: string;
      };
      let definition = body.definition;
      if (!definition) {
        const userDO = getUserDO(c, user.identifier);
        const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
          where: { field: 'id', operator: '=', value: id },
        }, 'agent_workflows');
        const wf = Array.isArray(rows) ? rows[0] : rows;
        const defStr = (wf as { definition?: string })?.definition ?? '';
        try {
          definition = defStr ? JSON.parse(defStr) : { nodes: [], edges: [] };
        } catch {
          definition = { nodes: [], edges: [] };
        }
      }
      const result = await autofixWorkflowDefinition(c.env, definition, body.error);
      return c.json(result);
    }, 'Failed to auto-fix workflow'),
  );

  // --- Version history ---
  app.get(
    '/:id/versions',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const userDO = getUserDO(c, user.identifier);
      const versions = await listVersions(userDO, id);
      return c.json({ versions });
    }, 'Failed to list workflow versions'),
  );

  app.post(
    '/:id/versions',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const body = (await c.req.json().catch(() => ({}))) as {
        definition?: string;
        label?: string;
        note?: string;
      };
      const userDO = getUserDO(c, user.identifier);
      let definition = body.definition;
      if (typeof definition !== 'string') {
        const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
          where: { field: 'id', operator: '=', value: id },
        }, 'agent_workflows');
        const wf = Array.isArray(rows) ? rows[0] : rows;
        definition = (wf as { definition?: string })?.definition ?? '{"nodes":[],"edges":[]}';
      }
      const version = await snapshotVersion(userDO, {
        workflowId: id,
        definition,
        label: body.label,
        note: body.note,
        reason: 'manual',
      });
      return c.json({ version }, 201);
    }, 'Failed to snapshot workflow version'),
  );

  app.post(
    '/:id/versions/:versionKey/restore',
    createRouteHandler(async (c: any, user: any) => {
      const id = parseInt(c.req.param('id'), 10);
      const versionKey = c.req.param('versionKey');
      if (isNaN(id)) throw new Error('Invalid workflow id');
      const userDO = getUserDO(c, user.identifier);
      const version = await getVersionByKey(userDO, versionKey);
      if (!version || version.workflowId !== id) {
        return c.json({ error: 'Version not found' }, 404);
      }
      const updated = await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id, definition: version.definition },
        'agent_workflows',
      );
      return c.json({ workflow: updated, restoredVersion: version.version });
    }, 'Failed to restore workflow version'),
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
      const sql = `SELECT id, globalId, user_id, name, description, tags, definition, starCount, starLabel, usageCount, totalEarningsUsd, status, created_at
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
