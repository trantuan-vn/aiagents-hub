import { Hono } from 'hono';

import { handleErrorWithoutIp } from '../../../../shared/utils';
import {
  buildHubLoginRedirectUrl,
  handleBasicAuthLoginPost,
  isFormAccessGranted,
  normalizeFormAuth,
  renderFormBasicLoginHtml,
  verifyHubUserSession,
  type FormAuthMode,
} from '../triggers/form-auth.js';
import {
  broadcastChatResult,
  extractChatReply,
  findChatTriggerNodeByPath,
  isChatTestListening,
  isChatTriggerNode,
  parseChatMessageRequest,
  renderChatInactiveHtml,
  resolveNodeChatPath,
  runChatTrigger,
  type ChatTriggerNodeData,
} from '../triggers/chat-submission.js';
import {
  findChatTriggerByWorkflowId,
  resolveOwnedWorkflow,
  syncChatTriggersForWorkflow,
} from '../triggers/triggers.js';

type ChatMode = 'test' | 'production';

function chatSegment(mode: ChatMode): string {
  return mode === 'production' ? 'chat' : 'chat-test';
}

function buildChatActionUrl(
  origin: string,
  mode: ChatMode,
  workflowId: number,
  chatPath: string,
  ownerId?: string,
): string {
  const base = `${origin}/${chatSegment(mode)}/${workflowId}/${encodeURIComponent(chatPath)}`;
  if (!ownerId) return base;
  const url = new URL(base);
  url.searchParams.set('owner_id', ownerId);
  return url.toString();
}

function buildFrontendChatPageUrl(
  frontend: string,
  mode: ChatMode,
  workflowId: number,
  chatPath: string,
  ownerId: string,
): string {
  const page = `${frontend.replace(/\/+$/, '')}/${chatSegment(mode)}/${workflowId}/${encodeURIComponent(chatPath)}`;
  const redirectUrl = new URL(page);
  redirectUrl.searchParams.set('owner_id', ownerId);
  return redirectUrl.toString();
}

function withHubAuthReturn(pageUrl: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('hub_auth', '1');
  return url.toString();
}

function unauthenticatedChatResponse(
  c: any,
  params: {
    json: boolean;
    method: string;
    chatAuth: FormAuthMode;
    chatTitle: string;
    actionUrl: string;
    pageUrl: string;
    frontend: string;
    headers: Record<string, string>;
  },
) {
  const { json, method, chatAuth, chatTitle, actionUrl, pageUrl, frontend, headers } = params;
  if (chatAuth === 'hub_users') {
    const loginUrl = buildHubLoginRedirectUrl(frontend, withHubAuthReturn(pageUrl));
    if (json || method !== 'GET') {
      return c.json({ error: 'Authentication required', auth: 'hub_users', loginUrl }, 401, headers);
    }
    return c.redirect(loginUrl, 302);
  }
  if (chatAuth === 'basic') {
    if (json || method !== 'GET') {
      return c.json({ error: 'Authentication required', auth: 'basic' }, 401, headers);
    }
    return c.html(renderFormBasicLoginHtml({ title: chatTitle, actionUrl }));
  }
  return c.json({ error: 'Authentication required' }, 401, headers);
}

function corsHeaders(originHeader: string | undefined, allowedOrigins: string): Record<string, string> {
  const allowed = allowedOrigins.trim() || '*';
  const requestOrigin = originHeader?.trim();
  let allow = '*';
  let credentials = 'false';
  if (allowed === '*') {
    if (requestOrigin) {
      allow = requestOrigin;
      credentials = 'true';
    }
  } else {
    const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
    allow = requestOrigin && list.includes(requestOrigin) ? requestOrigin : list[0] || '*';
    credentials = allow === '*' ? 'false' : 'true';
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Credentials': credentials,
    Vary: 'Origin',
  };
}

function wantsJson(c: { req: { query: (name: string) => string | undefined; header: (name: string) => string | undefined } }): boolean {
  if ((c.req.query('format') ?? '').toLowerCase() === 'json') return true;
  const accept = (c.req.header('accept') ?? '').toLowerCase();
  return accept.includes('application/json') && !accept.includes('text/html');
}

async function resolveChatContext(
  env: Env,
  bindingName: string,
  db: D1Database,
  workflowId: number,
  chatPathRaw: string,
  mode: ChatMode,
  ownerIdHint?: string,
) {
  const chatPath = decodeURIComponent(chatPathRaw).trim().replace(/^\/+/, '');
  const hint = ownerIdHint?.trim();
  let ownerId = hint && /^[0-9a-fA-F]{64}$/.test(hint) ? hint : undefined;
  let trigger = ownerId
    ? await findChatTriggerByWorkflowId(db, workflowId, ownerId, chatPath)
    : await findChatTriggerByWorkflowId(db, workflowId, undefined, chatPath);

  if (!ownerId && trigger?.ownerId) ownerId = trigger.ownerId;

  if (ownerId) {
    await syncChatTriggersForWorkflow(env, bindingName, db, ownerId, workflowId);
    trigger = await findChatTriggerByWorkflowId(db, workflowId, ownerId, chatPath);
  }

  if (!ownerId) return { error: 'Missing owner_id', status: 400 as const };

  const resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  const node =
    (trigger?.nodeId
      ? resolved.definition.nodes.find((n) => n.id === trigger!.nodeId)
      : undefined) ?? findChatTriggerNodeByPath(resolved.definition, chatPath);

  if (!node || !isChatTriggerNode(node)) {
    return { error: 'Chat not found', status: 404 as const };
  }

  if (mode === 'production') {
    const status = String(resolved.workflow.status ?? 'draft');
    if (status !== 'published') {
      return { error: 'Workflow is not published', status: 403 as const };
    }
    if (trigger && trigger.enabled !== 1) {
      return { error: 'Chat trigger is disabled', status: 403 as const };
    }
  }

  return {
    ownerId,
    resolved,
    node,
    chatPath: resolveNodeChatPath(node),
    trigger,
  };
}

async function handleChatRequest(
  c: any,
  bindingName: string,
  mode: ChatMode,
  workflowId: number,
  chatPathRaw: string,
) {
  const db = c.env.D1DB;
  if (!db) throw new Error('D1 database binding not configured');

  const ownerIdHint = c.req.query('owner_id') ?? undefined;
  const ctx = await resolveChatContext(
    c.env,
    bindingName,
    db,
    workflowId,
    chatPathRaw,
    mode,
    ownerIdHint,
  );

  const data = !('error' in ctx) ? ((ctx.node.data ?? {}) as ChatTriggerNodeData) : undefined;
  const options = (data?.chatOptions ?? {}) as Record<string, unknown>;
  const headers = corsHeaders(c.req.header('origin'), String(options.allowedOrigins ?? '*'));

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const json = wantsJson(c);

  if ('error' in ctx) {
    if (c.req.method === 'GET' && !json) {
      return c.html(`<h1>${ctx.error}</h1>`, ctx.status);
    }
    return c.json({ error: ctx.error }, ctx.status, headers);
  }

  if (mode === 'production' && data?.chatPublic === false) {
    if (c.req.method === 'GET' && !json) {
      return c.html(renderChatInactiveHtml('This chat is not publicly available.'), 403);
    }
    return c.json({ error: 'Chat is not publicly available' }, 403, headers);
  }

  if (mode === 'test') {
    const listening = await isChatTestListening(c.env.NONCE_KV, ctx.ownerId, workflowId, ctx.chatPath);
    if (!listening) {
      if (c.req.method === 'GET' && !json) {
        return c.html(renderChatInactiveHtml('This test chat is not currently active.'), 404);
      }
      return c.json({ error: 'Chat test is not active' }, 404, headers);
    }
  }

  const chatAuth = normalizeFormAuth(data?.chatAuth);
  const origin = (c.env.BASE_URL as string) || new URL(c.req.url).origin;
  const actionUrl = buildChatActionUrl(origin, mode, workflowId, ctx.chatPath, ctx.ownerId);
  const chatTitle = String(options.title || data?.label || 'Chat');
  const credentialKey = String(data?.chatCredentialKey ?? '');

  const frontend = (c.env.FRONTEND_URL as string) || 'https://aiagents-hub.vn';
  const pageUrl = buildFrontendChatPageUrl(frontend, mode, workflowId, ctx.chatPath, ctx.ownerId);

  if (c.req.method === 'POST' && chatAuth === 'basic') {
    const contentType = c.req.header('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await c.req.text();
      const params = new URLSearchParams(text);
      if (params.get('_form_auth') === 'login') {
        return handleBasicAuthLoginPost(c, bindingName, {
          workflowId,
          formPath: ctx.chatPath,
          ownerId: ctx.ownerId,
          credentialKey,
          returnUrl: pageUrl,
          formTitle: chatTitle,
          username: params.get('username') ?? '',
          password: params.get('password') ?? '',
          respondJson: json,
        });
      }
    }
  }

  let accessGranted = await isFormAccessGranted(c, bindingName, {
    formAuth: chatAuth,
    workflowId,
    formPath: ctx.chatPath,
    ownerId: ctx.ownerId,
    credentialKey,
  });
  // Editor listen URLs are already gated; allow the signed-in author to test
  // without completing the public Basic Auth / hub-user gate first.
  if (!accessGranted && mode === 'test') {
    accessGranted = await verifyHubUserSession(c, bindingName);
  }

  if (!accessGranted) {
    return unauthenticatedChatResponse(c, {
      json,
      method: c.req.method,
      chatAuth,
      chatTitle,
      actionUrl,
      pageUrl,
      frontend,
      headers,
    });
  }

  const hosted = String(data?.chatMode ?? 'hostedChat') !== 'webhook';

  if (c.req.method === 'GET') {
    if (!hosted) {
      return c.json({ ok: true, chatUrl: actionUrl }, 200, headers);
    }
    if (json) {
      return c.json(
        {
          ok: true,
          title: chatTitle,
          subtitle: String(options.subtitle ?? ''),
          initialMessages: String(data?.initialMessages ?? ''),
          inputPlaceholder: String(options.inputPlaceholder ?? 'Type your question..'),
          chatUrl: actionUrl,
        },
        200,
        headers,
      );
    }
    return c.redirect(pageUrl, 302);
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseChatMessageRequest(body);
  if (!parsed.chatInput) {
    return c.json({ error: 'Missing chatInput' }, 400, headers);
  }

  const chatUrl = actionUrl.split('?')[0] ?? actionUrl;
  const result = await runChatTrigger({
    env: c.env,
    bindingName,
    ownerId: ctx.ownerId,
    resolved: ctx.resolved,
    node: ctx.node,
    sessionId: parsed.sessionId,
    chatInput: parsed.chatInput,
    action: parsed.action,
    chatUrl,
    executionMode: mode,
    autoApproveHumanReview: ctx.trigger?.autoApproveHumanReview === 1,
  });

  await broadcastChatResult(c.env, bindingName, ctx.ownerId, {
    workflowId,
    nodeId: ctx.node.id,
    chatPath: ctx.chatPath,
    executionKey: result.executionKey,
    status: result.status,
    sessionId: parsed.sessionId,
    chatInput: parsed.chatInput,
    action: parsed.action,
    chatUrl,
    executionMode: mode,
  });

  if (result.status === 'failed') {
    const error =
      result.output && typeof result.output === 'object' && 'error' in result.output
        ? String((result.output as { error?: unknown }).error ?? 'failed')
        : 'Chat workflow failed';
    return c.json({ error, executionKey: result.executionKey }, 500, headers);
  }

  return c.json(
    {
      output: extractChatReply(result),
      executionKey: result.executionKey,
      status: result.status,
    },
    200,
    headers,
  );
}

/** Public hosted chat — GET renders HTML, POST runs the workflow from the chat node. */
export function createChatHookRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const register = (segment: string, mode: ChatMode) => {
    const handler = async (c: any) => {
      try {
        const workflowId = parseInt(c.req.param('workflowId'), 10);
        if (isNaN(workflowId)) return c.json({ error: 'Invalid workflow id' }, 400);
        const chatPath = c.req.param('chatPath');
        return await handleChatRequest(c, bindingName, mode, workflowId, chatPath);
      } catch (e) {
        const { errorResponse, status } = await handleErrorWithoutIp(e, 'Chat trigger failed', c.env);
        return c.json(errorResponse, status);
      }
    };
    app.options(`/${segment}/:workflowId/:chatPath`, handler);
    app.get(`/${segment}/:workflowId/:chatPath`, handler);
    app.post(`/${segment}/:workflowId/:chatPath`, handler);
  };

  register('chat-test', 'test');
  register('chat', 'production');

  return app;
}
