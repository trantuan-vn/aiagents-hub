import { Hono } from 'hono';

import { handleErrorWithoutIp } from '../../../../shared/utils';
import {
  broadcastFormSubmissionResult,
  findFormSubmissionNodeByPath,
  isFormSubmissionNode,
  isFormTestListening,
  parseFormSubmissionRequest,
  renderFormInactiveHtml,
  renderFormPageHtml,
  renderFormSuccessHtml,
  resolveNodeFormPath,
  runFormSubmissionTrigger,
  setFormTestListening,
  type FormElementConfig,
  type FormSubmissionNodeData,
} from '../triggers/form-submission.js';
import {
  findFormTriggerByWorkflowId,
  resolveOwnedWorkflow,
  syncFormTriggersForWorkflow,
} from '../triggers/triggers.js';

type FormMode = 'test' | 'production';

function formSegment(mode: FormMode): string {
  return mode === 'production' ? 'form' : 'form-test';
}

function buildFormActionUrl(origin: string, mode: FormMode, workflowId: number, formPath: string, ownerId?: string): string {
  const base = `${origin}/${formSegment(mode)}/${workflowId}/${encodeURIComponent(formPath)}`;
  if (!ownerId) return base;
  const url = new URL(base);
  url.searchParams.set('owner_id', ownerId);
  return url.toString();
}

async function resolveFormContext(
  env: Env,
  bindingName: string,
  db: D1Database,
  workflowId: number,
  formPathRaw: string,
  mode: FormMode,
  ownerIdHint?: string,
) {
  const formPath = decodeURIComponent(formPathRaw).trim().replace(/^\/+/, '');
  // Durable Object ids are 64-char hex strings; ignore hints that don't match so a
  // mistyped/legacy owner_id (e.g. a DB user id) doesn't crash idFromString().
  const hint = ownerIdHint?.trim();
  let ownerId = hint && /^[0-9a-fA-F]{64}$/.test(hint) ? hint : undefined;
  let trigger = ownerId
    ? await findFormTriggerByWorkflowId(db, workflowId, ownerId, formPath)
    : await findFormTriggerByWorkflowId(db, workflowId, undefined, formPath);

  // Fall back to the trigger row's owner when the hint was missing or invalid.
  if (!ownerId && trigger?.ownerId) ownerId = trigger.ownerId;

  if (ownerId) {
    await syncFormTriggersForWorkflow(env, bindingName, db, ownerId, workflowId);
    trigger = await findFormTriggerByWorkflowId(db, workflowId, ownerId, formPath);
  }

  if (!ownerId) return { error: 'Missing owner_id', status: 400 as const };

  const resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  const node =
    (trigger?.nodeId
      ? resolved.definition.nodes.find((n) => n.id === trigger!.nodeId)
      : undefined) ?? findFormSubmissionNodeByPath(resolved.definition, formPath);

  if (!node || !isFormSubmissionNode(node)) {
    return { error: 'Form not found', status: 404 as const };
  }

  if (mode === 'production') {
    const status = String(resolved.workflow.status ?? 'draft');
    if (status !== 'published') {
      return { error: 'Workflow is not published', status: 403 as const };
    }
    if (trigger && trigger.enabled !== 1) {
      return { error: 'Form trigger is disabled', status: 403 as const };
    }
  }

  return {
    ownerId,
    resolved,
    node,
    formPath: resolveNodeFormPath(node),
    trigger,
  };
}

async function handleFormRequest(
  c: any,
  bindingName: string,
  mode: FormMode,
  workflowId: number,
  formPathRaw: string,
) {
  const db = c.env.D1DB;
  if (!db) throw new Error('D1 database binding not configured');

  const ownerIdHint = c.req.query('owner_id') ?? undefined;
  const ctx = await resolveFormContext(
    c.env,
    bindingName,
    db,
    workflowId,
    formPathRaw,
    mode,
    ownerIdHint,
  );

  if ('error' in ctx) {
    if (c.req.method === 'GET') {
      return c.html(`<h1>${ctx.error}</h1>`, ctx.status);
    }
    return c.json({ error: ctx.error }, ctx.status);
  }

  // A test URL is only valid while the editor is actively listening (mirrors
  // n8n: press "Execute step" → form goes live → first submission consumes it).
  if (mode === 'test') {
    const listening = await isFormTestListening(c.env.NONCE_KV, ctx.ownerId, workflowId, ctx.formPath);
    if (!listening) {
      if (c.req.method === 'GET') {
        return c.html(renderFormInactiveHtml('This test form is not currently active.'), 404);
      }
      return c.json({ error: 'Form test is not active' }, 404);
    }
  }

  const data = (ctx.node.data ?? {}) as FormSubmissionNodeData;
  const elements = Array.isArray(data.formElements) ? (data.formElements as FormElementConfig[]) : [];
  const origin = (c.env.BASE_URL as string) || new URL(c.req.url).origin;
  const actionUrl = buildFormActionUrl(origin, mode, workflowId, ctx.formPath, ctx.ownerId);

  if (c.req.method === 'GET') {
    const html = renderFormPageHtml({
      title: String(data.formTitle || data.label || 'Form'),
      description: String(data.formDescription ?? ''),
      elements,
      actionUrl,
    });
    return c.html(html);
  }

  const fields = await parseFormSubmissionRequest(c.req.raw, elements);
  const formUrl = actionUrl.split('?')[0] ?? actionUrl;
  const result = await runFormSubmissionTrigger({
    env: c.env,
    bindingName,
    ownerId: ctx.ownerId,
    resolved: ctx.resolved,
    node: ctx.node,
    fields,
    formUrl,
    executionMode: mode,
    autoApproveHumanReview: ctx.trigger?.autoApproveHumanReview === 1,
  });

  await broadcastFormSubmissionResult(c.env, bindingName, ctx.ownerId, {
    workflowId,
    nodeId: ctx.node.id,
    formPath: ctx.formPath,
    executionKey: result.executionKey,
    status: result.status,
    fields,
    formUrl,
    executionMode: mode,
  });

  // One-shot test submission: deactivate the test URL after a successful run.
  if (mode === 'test') {
    await setFormTestListening(c.env.NONCE_KV, ctx.ownerId, workflowId, ctx.formPath, false);
  }

  const responseMode = String(data.formResponseMode ?? 'text');
  const responseText = String(data.formResponseText ?? 'Your response has been recorded.');

  if (responseMode === 'redirect' && responseText.startsWith('http')) {
    return c.redirect(responseText, 302);
  }

  return c.html(renderFormSuccessHtml(responseText));
}

/** Public form pages — GET renders HTML, POST runs workflow from form node. */
export function createFormHookRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const register = (segment: string, mode: FormMode) => {
    const handler = async (c: any) => {
      try {
        const workflowId = parseInt(c.req.param('workflowId'), 10);
        if (isNaN(workflowId)) return c.json({ error: 'Invalid workflow id' }, 400);
        const formPath = c.req.param('formPath');
        return await handleFormRequest(c, bindingName, mode, workflowId, formPath);
      } catch (e) {
        const { errorResponse, status } = await handleErrorWithoutIp(e, 'Form submission failed', c.env);
        return c.json(errorResponse, status);
      }
    };
    app.get(`/${segment}/:workflowId/:formPath`, handler);
    app.post(`/${segment}/:workflowId/:formPath`, handler);
  };

  register('form-test', 'test');
  register('form', 'production');

  return app;
}
