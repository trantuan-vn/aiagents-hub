import { buildChatTriggerOutput } from '@aiagents-hub/workflow-nodes';

import type { WorkflowDefinition } from '../domain/domain.js';
import { executeWorkflowGraph } from '../engine/executor.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { broadcastWorkflowWebhookResult } from './webhook-notify.js';

const CHAT_TEST_LISTEN_TTL = 60 * 15;

export type ChatTriggerNodeData = {
  label?: string;
  triggerKind?: string;
  chatPath?: string;
  chatPublic?: boolean;
  chatMode?: string;
  chatAuth?: string;
  chatCredentialKey?: string;
  initialMessages?: string;
  chatOptions?: Record<string, unknown>;
};

export function isChatTriggerNode(node: WorkflowDefinition['nodes'][number]): boolean {
  if (node.type !== 'trigger') return false;
  const data = (node.data ?? {}) as ChatTriggerNodeData;
  return data.triggerKind === 'chat';
}

export function resolveNodeChatPath(node: WorkflowDefinition['nodes'][number]): string {
  const data = (node.data ?? {}) as ChatTriggerNodeData;
  const custom = String(data.chatPath ?? '').trim().replace(/^\/+/, '');
  return custom || node.id;
}

export function findChatTriggerNodeByPath(
  definition: WorkflowDefinition,
  chatPath: string,
): WorkflowDefinition['nodes'][number] | undefined {
  const normalized = chatPath.trim().replace(/^\/+/, '');
  return definition.nodes.find((node) => {
    if (!isChatTriggerNode(node)) return false;
    const path = resolveNodeChatPath(node);
    return path === normalized || node.id === normalized;
  });
}

export function listChatTriggerNodes(definition: WorkflowDefinition) {
  return definition.nodes
    .filter(isChatTriggerNode)
    .map((node) => ({ nodeId: node.id, chatPath: resolveNodeChatPath(node) }));
}

function chatTestListenKey(ownerId: string, workflowId: number, chatPath: string): string {
  const normalized = chatPath.trim().replace(/^\/+/, '');
  return `chat-test-listen:${ownerId}:${workflowId}:${normalized}`;
}

export async function setChatTestListening(
  kv: KVNamespace | undefined,
  ownerId: string,
  workflowId: number,
  chatPath: string,
  active: boolean,
): Promise<void> {
  if (!kv) return;
  const key = chatTestListenKey(ownerId, workflowId, chatPath);
  if (active) {
    await kv.put(key, '1', { expirationTtl: CHAT_TEST_LISTEN_TTL });
  } else {
    await kv.delete(key);
  }
}

export async function isChatTestListening(
  kv: KVNamespace | undefined,
  ownerId: string,
  workflowId: number,
  chatPath: string,
): Promise<boolean> {
  if (!kv) return false;
  const key = chatTestListenKey(ownerId, workflowId, chatPath);
  return (await kv.get(key)) != null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderChatInactiveHtml(message: string): string {
  const text = escapeHtml(message || 'This chat is not currently available.');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chat not available</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f6; margin: 0; padding: 2rem 1rem; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); text-align: center; }
    h1 { margin: 0 0 .5rem; font-size: 1.2rem; }
    p { color: #555; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${text}</h1>
    <p>Open the workflow editor and click "Open chat" or "Test this trigger" on the chat node.</p>
  </div>
</body>
</html>`;
}

export function renderHostedChatHtml(params: {
  title: string;
  subtitle?: string;
  actionUrl: string;
  initialMessages: string;
  inputPlaceholder?: string;
  customCss?: string;
}): string {
  const pageTitle = escapeHtml(params.title || 'Chat');
  const subtitle = escapeHtml(params.subtitle || '');
  const placeholder = escapeHtml(params.inputPlaceholder || 'Type your question..');
  const initial = params.initialMessages
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeHtml(line));
  const initialJson = JSON.stringify(initial);
  const customCss = String(params.customCss ?? '').replace(/<\/style/gi, '<\\/style');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; background: #f4f4f5; min-height: 100vh; display: flex; flex-direction: column; }
    header { padding: 1rem 1.25rem .75rem; background: #fff; border-bottom: 1px solid #e4e4e7; }
    header h1 { margin: 0; font-size: 1.1rem; }
    header p { margin: .25rem 0 0; color: #71717a; font-size: .85rem; }
    #messages { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: .75rem; }
    .bubble { max-width: min(78%, 42rem); padding: .7rem .9rem; border-radius: 14px; line-height: 1.45; font-size: .95rem; white-space: pre-wrap; }
    .bot { align-self: flex-start; background: #fff; border: 1px solid #e4e4e7; }
    .user { align-self: flex-end; background: #ff6f00; color: #fff; }
    .error { align-self: flex-start; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    form { display: flex; gap: .5rem; padding: .85rem 1rem 1.1rem; background: #fff; border-top: 1px solid #e4e4e7; }
    textarea { flex: 1; resize: none; min-height: 44px; max-height: 120px; font: inherit; padding: .7rem .85rem; border: 1px solid #d4d4d8; border-radius: 12px; }
    button { border: 0; border-radius: 12px; background: #ff6f00; color: #fff; font-weight: 600; padding: 0 1rem; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    ${customCss}
  </style>
</head>
<body>
  <header>
    <h1>${pageTitle}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
  </header>
  <div id="messages"></div>
  <form id="chat-form">
    <textarea id="input" rows="1" placeholder="${placeholder}" autocomplete="off"></textarea>
    <button type="submit" id="send">Send</button>
  </form>
  <script>
    const actionUrl = ${JSON.stringify(params.actionUrl)};
    const initial = ${initialJson};
    const messages = document.getElementById('messages');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const sessionKey = 'chat-session:' + actionUrl;
    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
      sessionStorage.setItem(sessionKey, sessionId);
    }
    function addBubble(text, cls) {
      const el = document.createElement('div');
      el.className = 'bubble ' + cls;
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }
    initial.forEach((line) => addBubble(line, 'bot'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      addBubble(text, 'user');
      send.disabled = true;
      try {
        const res = await fetch(actionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'sendMessage', sessionId: sessionId, chatInput: text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          addBubble(data.error || ('Request failed (' + res.status + ')'), 'error');
        } else {
          const output = data.output != null ? data.output : data.text;
          addBubble(typeof output === 'string' ? output : JSON.stringify(output ?? data, null, 2), 'bot');
        }
      } catch (err) {
        addBubble(err && err.message ? err.message : 'Network error', 'error');
      } finally {
        send.disabled = false;
        input.focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  </script>
</body>
</html>`;
}

export function parseChatMessageRequest(body: Record<string, unknown>): {
  sessionId: string;
  chatInput: string;
  action: string;
} {
  const nested =
    body.body && typeof body.body === 'object' && !Array.isArray(body.body)
      ? (body.body as Record<string, unknown>)
      : {};
  const chatInput = String(
    body.chatInput ?? body.message ?? body.query ?? body.text ?? nested.chatInput ?? nested.message ?? '',
  ).trim();
  const sessionId = String(body.sessionId ?? nested.sessionId ?? crypto.randomUUID());
  const action = String(body.action ?? 'sendMessage');
  return { sessionId, chatInput, action };
}

function isChatTriggerEcho(rec: Record<string, unknown>): boolean {
  if (rec.triggerKind !== 'chat' && rec.action !== 'sendMessage') return false;
  const userText = typeof rec.chatInput === 'string' ? rec.chatInput : '';
  const replyFields = [rec.output, rec.message, rec.response, rec.reply, rec.text];
  return !replyFields.some((value) => typeof value === 'string' && value.trim() && value !== userText);
}

function textFromUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const rec = value as Record<string, unknown>;
  if (isChatTriggerEcho(rec)) return '';
  const userText = typeof rec.chatInput === 'string' ? rec.chatInput : '';
  const candidates = [rec.output, rec.text, rec.message, rec.response, rec.reply];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && candidate !== userText) return candidate;
    if (typeof candidate === 'string' && candidate.trim() && rec.triggerKind !== 'chat') return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = textFromUnknown(candidate);
      if (nested) return nested;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function extractChatReply(result: { output?: unknown; steps?: Array<{ output?: unknown }> }): string {
  const fromOutput = textFromUnknown(result.output);
  if (fromOutput) return fromOutput;
  const steps = result.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const text = textFromUnknown(steps[i]?.output);
    if (text) return text;
  }
  return '';
}

export async function runChatTrigger(params: {
  env: Env;
  bindingName: string;
  ownerId: string;
  resolved: ResolvedWorkflow;
  node: WorkflowDefinition['nodes'][number];
  sessionId: string;
  chatInput: string;
  action?: string;
  chatUrl: string;
  executionMode: 'test' | 'production';
  autoApproveHumanReview?: boolean;
}): Promise<Awaited<ReturnType<typeof executeWorkflowGraph>>> {
  const output = buildChatTriggerOutput({
    sessionId: params.sessionId,
    chatInput: params.chatInput,
    action: params.action,
    chatUrl: params.chatUrl,
    executionMode: params.executionMode,
  });
  return executeWorkflowGraph({
    c: { env: params.env } as any,
    bindingName: params.bindingName,
    user: { identifier: params.ownerId },
    resolved: params.resolved,
    input: params.chatInput,
    autoApproveHumanReview: params.autoApproveHumanReview ?? true,
    runnerDoIdString: params.ownerId,
    requestMeta: { userAgent: 'trigger:chat' },
    entryNodeIds: [params.node.id],
    runContextOverride: output,
  });
}

export async function broadcastChatResult(
  env: Env,
  bindingName: string,
  ownerId: string,
  event: {
    workflowId: number;
    nodeId: string;
    chatPath: string;
    executionKey: string;
    status: string;
    sessionId: string;
    chatInput: string;
    action?: string;
    chatUrl: string;
    executionMode: 'test' | 'production';
  },
): Promise<void> {
  const output = buildChatTriggerOutput({
    sessionId: event.sessionId,
    chatInput: event.chatInput,
    action: event.action,
    chatUrl: event.chatUrl,
    executionMode: event.executionMode,
  });
  await broadcastWorkflowWebhookResult(env, bindingName, ownerId, {
    workflowId: event.workflowId,
    nodeId: event.nodeId,
    webhookPath: event.chatPath,
    executionKey: event.executionKey,
    status: event.status,
    input: JSON.stringify({ sessionId: event.sessionId, chatInput: event.chatInput }),
    output,
    receivedAt: Date.now(),
    method: 'POST',
  });
}
