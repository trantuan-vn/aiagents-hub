import { isSimpleMemoryKind } from '@aiagents-hub/workflow-nodes';

import { executeUtils } from '../../../../../shared/utils.js';
import type { UserDO } from '../../../../ws/infrastructure/UserDO.js';
import { interpolateTemplate } from '../agent/shared.js';
import type { NodeContext } from '../types.js';
import type { AgentResourceContext } from '../../engine/graph-helpers.js';

export const SIMPLE_MEMORY_TABLE = 'simple_memory';
export const SIMPLE_MEMORY_DEFAULT_WINDOW = 5;
export const SIMPLE_MEMORY_DEFAULT_SESSION_KEY = '{{ $json.sessionId }}';

export type SimpleMemoryRole = 'user' | 'assistant';

export type SimpleMemoryMessage = {
  role: SimpleMemoryRole;
  content: string;
};

export function simpleMemoryKey(workflowId: number, sessionId: string, memoryNodeId: string): string {
  return `${workflowId}:${sessionId || 'default'}:${memoryNodeId}`;
}

export function clampContextWindow(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return SIMPLE_MEMORY_DEFAULT_WINDOW;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

export function clipMemoryWindow(
  messages: SimpleMemoryMessage[],
  windowLength: number,
): SimpleMemoryMessage[] {
  const n = clampContextWindow(windowLength);
  return messages.slice(-(n * 2));
}

export function parseSimpleMemoryMessages(raw: unknown): SimpleMemoryMessage[] {
  let value: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: SimpleMemoryMessage[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    const content = String(item.content ?? '').trim();
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, 4000) });
  }
  return out;
}

export function formatSimpleMemoryHistory(messages: SimpleMemoryMessage[]): string {
  if (!messages.length) return '';
  return messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n');
}

function sessionFromInput(input: Record<string, unknown>, fallback = ''): string {
  const body = input.body;
  const nested =
    body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const raw = input.sessionId ?? nested.sessionId ?? input.session_id ?? fallback;
  return String(raw ?? '').trim().slice(0, 80);
}

export function resolveSimpleMemorySessionId(args: {
  sessionIdSource?: unknown;
  sessionKey?: unknown;
  input: Record<string, unknown>;
  runSessionId?: unknown;
  fallbackInput?: string;
}): string {
  const source = String(args.sessionIdSource ?? 'from_chat_trigger');
  const template = String(args.sessionKey ?? SIMPLE_MEMORY_DEFAULT_SESSION_KEY);
  const scope = {
    ...args.input,
    $json: args.input,
    json: args.input,
    input: args.fallbackInput ?? '',
  };
  const interpolated = interpolateTemplate(template, scope).trim().slice(0, 80);
  if (source === 'define_below') {
    return interpolated || 'default';
  }
  return sessionFromInput(args.input, String(args.runSessionId ?? '')) || interpolated || 'default';
}

export function isLinkedSimpleMemory(linked: Pick<AgentResourceContext, 'memoryKind'>): boolean {
  return isSimpleMemoryKind(linked.memoryKind);
}

export async function loadSimpleMemory(
  userDO: DurableObjectStub<UserDO> | undefined,
  key: string,
  windowLength: number,
): Promise<SimpleMemoryMessage[]> {
  if (!userDO || !key || typeof userDO.fetch !== 'function') return [];
  try {
    const rows = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'memoryKey', operator: '=', value: key }, limit: 1 },
      SIMPLE_MEMORY_TABLE,
    );
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
    if (!row) return [];
    return clipMemoryWindow(parseSimpleMemoryMessages(row.messages), windowLength);
  } catch (e) {
    console.warn('[simple-memory] load failed:', e);
    return [];
  }
}

export async function saveSimpleMemoryTurn(
  userDO: DurableObjectStub<UserDO> | undefined,
  args: {
    workflowId: number;
    sessionId: string;
    memoryNodeId: string;
    windowLength: number;
    userText: string;
    assistantText: string;
  },
): Promise<void> {
  if (!userDO || typeof userDO.fetch !== 'function') return;
  const key = simpleMemoryKey(args.workflowId, args.sessionId, args.memoryNodeId);
  const existing = await loadSimpleMemory(userDO, key, 99);
  const next = clipMemoryWindow(
    [
      ...existing,
      { role: 'user', content: args.userText.trim().slice(0, 4000) },
      { role: 'assistant', content: args.assistantText.trim().slice(0, 4000) },
    ].filter((m) => m.content),
    args.windowLength,
  );
  const payload = {
    memoryKey: key,
    workflowId: args.workflowId,
    sessionId: args.sessionId || 'default',
    memoryNodeId: args.memoryNodeId,
    messages: JSON.stringify(next),
    updatedAt: Date.now(),
  };
  try {
    const rows = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'memoryKey', operator: '=', value: key }, limit: 1 },
      SIMPLE_MEMORY_TABLE,
    );
    const row = (Array.isArray(rows) ? rows[0] : rows) as { id?: number } | undefined;
    if (row?.id) {
      await executeUtils.executeDynamicAction(userDO, 'update', { id: row.id, ...payload }, SIMPLE_MEMORY_TABLE);
      return;
    }
    await executeUtils.executeDynamicAction(userDO, 'insert', payload, SIMPLE_MEMORY_TABLE);
  } catch (e) {
    console.warn('[simple-memory] save failed:', e);
  }
}

export async function attachSimpleMemory(
  ctx: NodeContext,
  linked: AgentResourceContext,
  userText: string,
): Promise<{
  history: SimpleMemoryMessage[];
  historyText: string;
  persist: (assistantText: string) => Promise<void>;
}> {
  const noop = {
    history: [] as SimpleMemoryMessage[],
    historyText: '',
    persist: async () => undefined,
  };
  if (!isLinkedSimpleMemory(linked) || !linked.memoryNodeId) return noop;
  const nodeInput = (ctx.nodeInput ?? {}) as Record<string, unknown>;
  const sessionId = resolveSimpleMemorySessionId({
    sessionIdSource: linked.memorySessionIdSource,
    sessionKey: linked.memorySessionKey,
    input: nodeInput,
    runSessionId: ctx.runContext?.sessionId,
    fallbackInput: ctx.input,
  });
  const windowLength = clampContextWindow(linked.memoryContextWindowLength);
  const key = simpleMemoryKey(ctx.meta.workflowId, sessionId, linked.memoryNodeId);
  const history = await loadSimpleMemory(ctx.userDO, key, windowLength);
  return {
    history,
    historyText: formatSimpleMemoryHistory(history),
    persist: async (assistantText: string) => {
      await saveSimpleMemoryTurn(ctx.userDO, {
        workflowId: ctx.meta.workflowId,
        sessionId,
        memoryNodeId: linked.memoryNodeId!,
        windowLength,
        userText,
        assistantText,
      });
    },
  };
}
