import { AsyncLocalStorage } from 'node:async_hooks';

import type { UserDO } from '../../../ws/infrastructure/UserDO.js';

export type WorkflowExecutionProgressType = 'started' | 'node_start' | 'node_done' | 'node_phase' | 'finished';

export type WorkflowExecutionProgressStatus =
  | 'success'
  | 'error'
  | 'skipped'
  | 'pending_human'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowExecutionProgressEvent {
  type: WorkflowExecutionProgressType;
  workflowId: number;
  executionKey: string;
  /** Trigger / entry node that started this run. */
  entryNodeId?: string;
  nodeId?: string;
  nodeType?: string;
  /** Display name from the node, so a chat client can render the log without the graph. */
  label?: string;
  status?: WorkflowExecutionProgressStatus;
  /** Set while an agent node is inside a model call. */
  phase?: 'reasoning';
  /** Live transcript of what the agent model is doing, clipped for the chat. */
  activityLog?: AgentActivityItem[];
  /** Clipped node input so the editor log can render before the run is persisted. */
  input?: unknown;
  /** Clipped node output for live canvas pin (node_done only). */
  output?: unknown;
}

const KIND_LABEL_KEYS = ['label', 'agentKind', 'triggerKind', 'toolKind', 'flowKind', 'coreKind', 'transformKind', 'memoryKind'] as const;

export function progressNodeLabel(node: { type?: string; data?: unknown } | undefined): string | undefined {
  if (!node) return undefined;
  const data = node.data && typeof node.data === 'object' ? (node.data as Record<string, unknown>) : {};
  for (const key of KIND_LABEL_KEYS) {
    const value = data[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text) continue;
    return (key === 'label' ? text : text.replace(/_/g, ' ')).slice(0, 120);
  }
  const type = String(node.type ?? '').trim();
  return type ? type.replace(/_/g, ' ').slice(0, 120) : undefined;
}

export type AgentWork =
  | 'reasoning'
  | 'rewrite'
  | 'retrieve'
  | 'sql'
  | 'validate'
  | 'ask'
  | 'tool'
  | 'answer';

export type AgentActivityItem = {
  work: AgentWork;
  tool?: string;
  text: string;
};

const ACTIVITY_TAIL = 900;
const ACTIVITY_PREVIEW = 160;
const ACTIVITY_ITEMS = 6;

/** Fold one model delta or stage change into the chat transcript. */
export function appendAgentActivity(
  items: AgentActivityItem[],
  update: { work?: AgentWork; tool?: string; text?: string },
): AgentActivityItem[] {
  const text = update.text ?? '';
  const last = items[items.length - 1];
  const same =
    !!last &&
    (update.work == null || last.work === update.work) &&
    (update.tool == null || (last.tool ?? '') === update.tool);
  if (same && last && update.work == null) {
    if (!text) return items;
    return [...items.slice(0, -1), { ...last, text: (last.text + text).slice(-ACTIVITY_TAIL) }];
  }
  if (!update.work) {
    if (!text) return items;
    return appendAgentActivity(items, { work: 'answer', text });
  }
  if (same && last && !text) return items;
  const prior = items.map((item, index) =>
    index === items.length - 1 ? { ...item, text: item.text.slice(-ACTIVITY_PREVIEW) } : item,
  );
  return [
    ...prior,
    { work: update.work, ...(update.tool ? { tool: update.tool } : {}), text: text.slice(-ACTIVITY_TAIL) },
  ].slice(-ACTIVITY_ITEMS);
}

/** Fields a public chat client may render. Omits input, output, and the execution key. */
export type PublicChatProgressEvent = {
  type: WorkflowExecutionProgressType;
  nodeId?: string;
  nodeType?: string;
  label?: string;
  status?: WorkflowExecutionProgressStatus;
  phase?: 'reasoning';
  activityLog?: AgentActivityItem[];
};

export function toPublicChatProgress(event: WorkflowExecutionProgressEvent): PublicChatProgressEvent {
  return {
    type: event.type,
    ...(event.nodeId ? { nodeId: event.nodeId } : {}),
    ...(event.nodeType ? { nodeType: event.nodeType } : {}),
    ...(event.label ? { label: event.label } : {}),
    ...(event.status ? { status: event.status } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
    ...(event.activityLog?.length ? { activityLog: event.activityLog } : {}),
  };
}

type ProgressListener = (event: WorkflowExecutionProgressEvent) => void;

const progressListeners = new AsyncLocalStorage<ProgressListener[]>();

/** Receive progress events emitted while `fn` runs, including nested engine broadcasts. */
export function subscribeExecutionProgress<T>(listener: ProgressListener, fn: () => Promise<T>): Promise<T> {
  const parent = progressListeners.getStore() ?? [];
  return progressListeners.run([...parent, listener], fn);
}

function notifyProgressListeners(event: WorkflowExecutionProgressEvent): void {
  const list = progressListeners.getStore();
  if (!list?.length) return;
  for (const listener of list) {
    try {
      listener(event);
    } catch (e) {
      console.warn('[execution-progress] listener failed', e instanceof Error ? e.message : String(e));
    }
  }
}

type ActivitySink = {
  ctx: {
    node: { id: string; type?: string; data?: unknown };
    userDO: DurableObjectStub<UserDO>;
    meta: { workflowId: number };
    executionKey?: string;
  };
  items: AgentActivityItem[];
  lastSent: number;
  pending: ReturnType<typeof setTimeout> | null;
};

const activitySinks = new AsyncLocalStorage<ActivitySink>();
const ACTIVITY_FLUSH_MS = 160;

export function hasAgentActivity(): boolean {
  return activitySinks.getStore() != null;
}

function flushAgentActivity(sink: ActivitySink): void {
  if (sink.pending) {
    clearTimeout(sink.pending);
    sink.pending = null;
  }
  sink.lastSent = Date.now();
  if (!sink.ctx.executionKey || !sink.items.length) return;
  const label = progressNodeLabel(sink.ctx.node);
  void broadcastWorkflowExecutionProgress(sink.ctx.userDO, {
    type: 'node_phase',
    workflowId: sink.ctx.meta.workflowId,
    executionKey: sink.ctx.executionKey,
    nodeId: sink.ctx.node.id,
    ...(sink.ctx.node.type ? { nodeType: sink.ctx.node.type } : {}),
    ...(label ? { label } : {}),
    phase: 'reasoning',
    status: 'running',
    activityLog: sink.items.map((item) => ({ ...item })),
  });
}

function scheduleAgentActivity(sink: ActivitySink): void {
  const now = Date.now();
  if (now - sink.lastSent >= ACTIVITY_FLUSH_MS) {
    flushAgentActivity(sink);
    return;
  }
  if (sink.pending) return;
  sink.pending = setTimeout(() => {
    sink.pending = null;
    flushAgentActivity(sink);
  }, ACTIVITY_FLUSH_MS);
}

/** Run `fn` while model deltas and stage changes are pushed to the chat log. */
export function withAgentActivity<T>(
  ctx: ActivitySink['ctx'],
  fn: () => Promise<T>,
): Promise<T> {
  const sink: ActivitySink = { ctx, items: [], lastSent: 0, pending: null };
  return activitySinks.run(sink, async () => {
    try {
      return await fn();
    } finally {
      flushAgentActivity(sink);
    }
  });
}

/** Start a visible stage. Model tokens that follow append to this stage. */
export function noteAgentWork(work: AgentWork, tool?: string): void {
  const sink = activitySinks.getStore();
  if (!sink) return;
  const last = sink.items[sink.items.length - 1];
  if (last?.work === work && (last.tool ?? '') === (tool ?? '') && !last.text) return;
  sink.items = appendAgentActivity(sink.items, { work, ...(tool ? { tool } : {}) });
  flushAgentActivity(sink);
}

/** Append streamed model text to the current stage. */
export function pushAgentActivityText(text: string): void {
  const sink = activitySinks.getStore();
  if (!sink || !text) return;
  const last = sink.items[sink.items.length - 1];
  if (!last || last.work === 'tool' || last.work === 'retrieve' || last.work === 'validate') {
    sink.items = appendAgentActivity(sink.items, { work: 'answer', text });
  } else {
    sink.items = appendAgentActivity(sink.items, { text });
  }
  scheduleAgentActivity(sink);
}

/** Tell connected clients that the current agent node is in a model reasoning call. */
export async function reportAgentReasoning(ctx: {
  node: { id: string; type?: string; data?: unknown };
  userDO: DurableObjectStub<UserDO>;
  meta: { workflowId: number };
  executionKey?: string;
}): Promise<void> {
  if (!ctx.executionKey) return;
  const label = progressNodeLabel(ctx.node);
  await broadcastWorkflowExecutionProgress(ctx.userDO, {
    type: 'node_phase',
    workflowId: ctx.meta.workflowId,
    executionKey: ctx.executionKey,
    nodeId: ctx.node.id,
    ...(ctx.node.type ? { nodeType: ctx.node.type } : {}),
    ...(label ? { label } : {}),
    phase: 'reasoning',
    status: 'running',
  });
}

/** Push live node progress to the runner's connected WebSocket clients. */
export async function broadcastWorkflowExecutionProgress(
  userDO: DurableObjectStub<UserDO>,
  event: WorkflowExecutionProgressEvent,
): Promise<void> {
  notifyProgressListeners(event);
  if (typeof userDO?.fetch !== 'function') return;
  try {
    const res = await userDO.fetch(
      new Request('http://do/workflow/execution/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
    if (!res.ok) {
      console.warn('[execution-progress] broadcast failed', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[execution-progress] broadcast error', e instanceof Error ? e.message : String(e));
  }
}
