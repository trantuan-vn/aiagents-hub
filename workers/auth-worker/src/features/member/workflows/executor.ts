import type { WorkflowDefinition, WorkflowNodeTypeSchema } from './domain.js';
import type { z } from 'zod';
import type { ResolvedWorkflow } from './workflow-context.js';
import { workflowAttribution } from './workflow-context.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from './billing.js';
import { getIdFromName } from '../../../shared/utils.js';
import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import {
  createExecution,
  getExecutionByKey,
  updateExecution,
} from './execution-store.js';
import { resolveCredential } from './credentials.js';
import { runCodeNode, runHttpRequest } from './node-runtime.js';

type NodeType = z.infer<typeof WorkflowNodeTypeSchema>;

export interface ExecutionStepLog {
  nodeId: string;
  nodeType: NodeType;
  status: 'success' | 'error' | 'skipped' | 'pending_human';
  input?: unknown;
  output?: unknown;
  error?: string;
  costVnd?: number;
  durationMs?: number;
  /** Number of attempts taken (>1 means the node was retried). */
  attempts?: number;
}

export interface WorkflowExecutionResult {
  status: 'completed' | 'failed' | 'pending_human' | 'cancelled';
  executionKey: string;
  workflowId: number;
  workflowOwnerId: string;
  output?: unknown;
  steps: ExecutionStepLog[];
  totalCostVnd: number;
  /** Set when status = pending_human: the node awaiting a decision. */
  pendingNodeId?: string;
}

export interface ExecuteWorkflowParams {
  c: any;
  bindingName: string;
  user: { identifier: string };
  resolved: ResolvedWorkflow;
  input?: string;
  variables?: Record<string, unknown>;
  autoApproveHumanReview?: boolean;
  requestMeta?: { userAgent?: string; ipAddress?: string };
  /**
   * When set, the run executes against the Durable Object addressed by this id
   * string (used by triggers, where no authenticated identifier is available).
   */
  runnerDoIdString?: string;
}

type NodeOutput = Record<string, unknown>;

/** Minimal workflow metadata needed to bill and resume without re-fetching. */
interface EngineMeta {
  ownerId: string;
  workflowId: number;
  isOwnedByUser: boolean;
  workflowName: string;
  workflowDescription?: string;
}

/** Serializable engine snapshot persisted between requests for durable resume. */
interface EngineState {
  order: string[];
  cursor: number;
  outputs: Record<string, NodeOutput>;
  steps: ExecutionStepLog[];
  runContext: NodeOutput;
  totalCostVnd: number;
  finalOutput?: unknown;
}

interface PersistedState {
  definition: WorkflowDefinition;
  meta: EngineMeta;
  input?: string;
  variables: Record<string, unknown>;
  autoApproveHumanReview: boolean;
  requestMeta?: { userAgent?: string; ipAddress?: string };
  engine: EngineState;
}

export interface HumanDecision {
  nodeId: string;
  approved: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function topologicalOrder(definition: WorkflowDefinition): string[] {
  const { nodes, edges } = definition;
  const ids = nodes.map((n) => n.id);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!adj.has(e.source) || !inDegree.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length < ids.length) {
    for (const id of ids) {
      if (!order.includes(id)) order.push(id);
    }
  }
  return order;
}

function gatherInputs(
  nodeId: string,
  edges: WorkflowDefinition['edges'],
  outputs: Record<string, NodeOutput>,
): NodeOutput {
  const parents = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  if (!parents.length) return {};
  const merged: NodeOutput = { parents: {} as Record<string, NodeOutput> };
  const parentMap = merged.parents as Record<string, NodeOutput>;
  for (const p of parents) {
    parentMap[p] = outputs[p] ?? {};
  }
  const last = outputs[parents[parents.length - 1]];
  if (last?.text) merged.text = last.text;
  if (last?.data) merged.data = last.data;
  return merged;
}

async function queryVectorMemory(
  env: Env,
  collection: string,
  query: string,
): Promise<string[]> {
  const binding = (env as unknown as Record<string, unknown>).VECTORIZE as
    | { query: (vector: number[], opts: { topK: number }) => Promise<{ matches?: { metadata?: Record<string, string> }[] }> }
    | undefined;
  if (!binding?.query || !query.trim()) return [];

  try {
    const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query });
    const vector = (embed as { data?: number[][] })?.data?.[0];
    if (!vector?.length) return [];
    const index = (env as unknown as Record<string, unknown>)[collection] as typeof binding | undefined;
    const target = index ?? binding;
    const result = await target.query(vector, { topK: 5 });
    return (result.matches ?? [])
      .map((m) => m.metadata?.text ?? m.metadata?.content ?? '')
      .filter(Boolean);
  } catch (e) {
    console.warn('[workflow] vector memory query failed:', e);
    return [];
  }
}

/**
 * Resolve the runner Durable Object. Interactive runs address it by identifier;
 * trigger runs (no identifier) address it directly by DO id string.
 */
function resolveRunnerDO(
  c: any,
  bindingName: string,
  identifier: string,
  runnerDoIdString?: string,
): DurableObjectStub<UserDO> {
  if (runnerDoIdString) {
    const binding = c.env[bindingName] as DurableObjectNamespace;
    return binding.get(binding.idFromString(runnerDoIdString)) as DurableObjectStub<UserDO>;
  }
  return getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** Run `fn` honoring an optional per-node retry policy (`data.retry`). */
async function withRetry<T>(
  data: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<{ value: T; attempts: number }> {
  const retry = (data?.retry ?? {}) as { maxAttempts?: number; backoffMs?: number };
  const maxAttempts = clamp(Number(retry.maxAttempts ?? 1), 1, 5);
  const backoffMs = clamp(Number(retry.backoffMs ?? 0), 0, 10_000);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && backoffMs > 0) {
        await sleep(backoffMs * attempt);
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Node execution (pure-ish; flow control for human_review lives in the engine)
// ---------------------------------------------------------------------------

interface NodeContext {
  c: any;
  bindingName: string;
  user: { identifier: string };
  userDO: DurableObjectStub<UserDO>;
  meta: EngineMeta;
  attr: ReturnType<typeof workflowAttribution>;
  input?: string;
  requestMeta?: { userAgent?: string; ipAddress?: string };
  runContext: NodeOutput;
}

async function executeNodeLogic(
  node: WorkflowDefinition['nodes'][number],
  nodeInput: NodeOutput,
  ctx: NodeContext,
  onCost: (vnd: number) => void,
): Promise<NodeOutput> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const scope: Record<string, unknown> = {
    ...nodeInput,
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };

  switch (node.type) {
    case 'trigger':
      return { ...ctx.runContext, triggeredAt: Date.now(), text: ctx.input ?? '' };

    case 'http_request': {
      const credentialKey = String(data.credentialId ?? data.credentialKey ?? '');
      const credential = credentialKey
        ? await resolveCredential(ctx.userDO, ctx.c.env, credentialKey)
        : null;
      const result = await runHttpRequest(data, scope, credential);
      if (!result.ok && data.failOnError !== false) {
        throw new Error(`HTTP request failed with status ${result.status}`);
      }
      const text =
        result.text ??
        (typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
      return { status: result.status, ok: result.ok, headers: result.headers, data: result.body, text };
    }

    case 'code':
      return { ...runCodeNode(data, scope) };

    case 'agent': {
      const endpoint = String(data.serviceEndpoint ?? data.endpoint ?? '').trim();
      if (!endpoint) throw new Error('Agent node missing serviceEndpoint');

      await ensureWalletBalance(ctx.userDO);
      const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
      const modelId = getModelForService(service);

      const userText =
        String(nodeInput.text ?? ctx.input ?? '') || JSON.stringify(nodeInput);

      const memorySnippets = data.memoryCollection
        ? await queryVectorMemory(ctx.c.env, String(data.memoryCollection), userText)
        : [];

      const systemParts = [
        String(data.systemPrompt ?? data.prompt ?? ''),
        ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
        memorySnippets.length ? `Relevant memory:\n${memorySnippets.join('\n')}` : '',
        Array.isArray(data.tools) && data.tools.length
          ? `Available tools (configure in service): ${JSON.stringify(data.tools)}`
          : '',
      ].filter(Boolean);

      const messages = [
        ...(systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []),
        { role: 'user', content: userText },
      ];

      const maxTokens = Number(data.maxTokens ?? 1024) || 1024;
      const aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens);
      const text = extractTextFromAiResponse(aiResponse);

      const costVnd = await billAgentUsage(
        ctx.c.env,
        ctx.bindingName,
        ctx.userDO,
        ctx.user.identifier,
        service,
        {
          endpoint,
          aiResponse,
          userAgent: ctx.requestMeta?.userAgent,
          ipAddress: ctx.requestMeta?.ipAddress,
          workflowAttribution: ctx.attr,
        },
      );
      onCost(costVnd);
      return { text, raw: aiResponse, endpoint };
    }

    case 'flow':
      return { ...nodeInput, passthrough: true };

    case 'core': {
      const op = String(data.operation ?? 'identity');
      if (op === 'set_variable' && data.key) {
        ctx.runContext.variables = {
          ...(ctx.runContext.variables as Record<string, unknown>),
          [String(data.key)]: data.value,
        };
      }
      return { ...nodeInput, variables: ctx.runContext.variables };
    }

    case 'action_in_app':
      return {
        ...nodeInput,
        action: String(data.action ?? 'noop'),
        result: `Action "${data.action ?? 'noop'}" recorded (extensible)`,
      };

    case 'data_transformation': {
      const mode = String(data.mode ?? 'pick_text');
      if (mode === 'json_parse' && typeof nodeInput.text === 'string') {
        try {
          return { data: JSON.parse(nodeInput.text) };
        } catch {
          return { data: nodeInput.text };
        }
      }
      return { text: nodeInput.text ?? JSON.stringify(nodeInput), data: nodeInput };
    }

    default:
      return { ...nodeInput };
  }
}

// ---------------------------------------------------------------------------
// Durable engine
// ---------------------------------------------------------------------------

interface RunEngineArgs {
  c: any;
  bindingName: string;
  user: { identifier: string };
  userDO: DurableObjectStub<UserDO>;
  persisted: PersistedState;
  decision?: HumanDecision;
}

interface RunEngineResult {
  status: WorkflowExecutionResult['status'];
  output?: unknown;
  pendingNodeId?: string;
}

/**
 * Core loop. Advances `persisted.engine` from its current cursor until the
 * workflow completes, fails, or pauses for human review. Mutates the engine
 * state in place so the caller can persist it.
 */
async function runEngine(args: RunEngineArgs): Promise<RunEngineResult> {
  const { c, bindingName, user, userDO, persisted } = args;
  const { definition, meta, engine } = persisted;
  let { decision } = args;

  const attr = workflowAttribution({
    workflow: {},
    definition,
    ownerId: meta.ownerId,
    workflowId: meta.workflowId,
    isOwnedByUser: meta.isOwnedByUser,
  } as ResolvedWorkflow);

  const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));
  const ctx: NodeContext = {
    c,
    bindingName,
    user,
    userDO,
    meta,
    attr,
    input: persisted.input,
    requestMeta: persisted.requestMeta,
    runContext: engine.runContext,
  };

  while (engine.cursor < engine.order.length) {
    const nodeId = engine.order[engine.cursor];
    const node = nodeById.get(nodeId);
    if (!node) {
      engine.cursor += 1;
      continue;
    }

    const nodeInput = gatherInputs(nodeId, definition.edges, engine.outputs);
    const started = Date.now();
    const log: ExecutionStepLog = {
      nodeId,
      nodeType: node.type,
      status: 'success',
      input: nodeInput,
    };

    // --- human review: flow control + pause/resume ---
    if (node.type === 'human_review') {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const matchedDecision = decision && decision.nodeId === nodeId ? decision : undefined;

      if (!matchedDecision && !persisted.autoApproveHumanReview) {
        log.status = 'pending_human';
        log.output = {
          message: String(data.message ?? 'Awaiting human approval'),
          payload: nodeInput,
        };
        engine.steps.push({ ...log, durationMs: Date.now() - started });
        engine.outputs[nodeId] = log.output as NodeOutput;
        engine.finalOutput = log.output;
        // Leave cursor pointing at this node so resume re-enters here.
        return { status: 'pending_human', output: log.output, pendingNodeId: nodeId };
      }

      if (matchedDecision && matchedDecision.approved === false) {
        log.status = 'skipped';
        log.output = { approved: false, note: matchedDecision.note, rejectedAt: Date.now() };
        engine.steps.push({ ...log, durationMs: Date.now() - started });
        engine.outputs[nodeId] = log.output as NodeOutput;
        engine.finalOutput = log.output;
        return { status: 'cancelled', output: log.output };
      }

      const out: NodeOutput = {
        ...nodeInput,
        approved: true,
        approvedAt: Date.now(),
        ...(matchedDecision?.note ? { note: matchedDecision.note } : {}),
      };
      decision = undefined; // consumed
      log.output = out;
      engine.steps.push({ ...log, durationMs: Date.now() - started });
      engine.outputs[nodeId] = out;
      engine.finalOutput = out;
      engine.cursor += 1;
      continue;
    }

    // --- all other node types: execute with retry ---
    try {
      const { value: out, attempts } = await withRetry(
        (node.data ?? {}) as Record<string, unknown>,
        () =>
          executeNodeLogic(node, nodeInput, ctx, (vnd) => {
            engine.totalCostVnd += vnd;
            log.costVnd = (log.costVnd ?? 0) + vnd;
          }),
      );
      if (attempts > 1) log.attempts = attempts;
      log.output = out;
      engine.steps.push({ ...log, durationMs: Date.now() - started });
      engine.outputs[nodeId] = out;
      engine.finalOutput = out;
      engine.cursor += 1;
    } catch (e) {
      log.status = 'error';
      log.error = e instanceof Error ? e.message : String(e);
      engine.steps.push({ ...log, durationMs: Date.now() - started });
      return { status: 'failed', output: { error: log.error, lastNode: nodeId } };
    }
  }

  return { status: 'completed', output: engine.finalOutput };
}

/** Persist the latest engine snapshot + result onto the execution record. */
async function persistResult(
  userDO: DurableObjectStub<UserDO>,
  executionId: number,
  persisted: PersistedState,
  result: RunEngineResult,
): Promise<void> {
  const terminal = result.status !== 'pending_human';
  await updateExecution(userDO, executionId, {
    status: result.status,
    state: JSON.stringify(persisted),
    output: result.output !== undefined ? JSON.stringify(result.output) : undefined,
    totalCostVnd: persisted.engine.totalCostVnd,
    stepCount: persisted.engine.steps.length,
    pendingNodeId: result.pendingNodeId ?? '',
    error: result.status === 'failed' ? String((result.output as any)?.error ?? 'failed') : undefined,
    finishedAt: terminal ? Date.now() : undefined,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeWorkflowGraph(
  params: ExecuteWorkflowParams,
): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, resolved, input, variables = {}, autoApproveHumanReview } = params;
  const { definition } = resolved;
  const userDO = resolveRunnerDO(c, bindingName, user.identifier, params.runnerDoIdString);
  const executionKey = crypto.randomUUID();

  if (!definition.nodes.length) {
    return {
      status: 'failed',
      executionKey,
      workflowId: resolved.workflowId,
      workflowOwnerId: resolved.ownerId,
      output: { error: 'Workflow has no nodes' },
      steps: [],
      totalCostVnd: 0,
    };
  }

  const persisted: PersistedState = {
    definition,
    meta: {
      ownerId: resolved.ownerId,
      workflowId: resolved.workflowId,
      isOwnedByUser: resolved.isOwnedByUser,
      workflowName: String(resolved.workflow.name ?? ''),
      workflowDescription: resolved.workflow.description
        ? String(resolved.workflow.description)
        : undefined,
    },
    input,
    variables,
    autoApproveHumanReview: autoApproveHumanReview ?? false,
    requestMeta: params.requestMeta,
    engine: {
      order: topologicalOrder(definition),
      cursor: 0,
      outputs: {},
      steps: [],
      runContext: {
        input: input ?? '',
        variables,
        workflowName: resolved.workflow.name,
      },
      totalCostVnd: 0,
    },
  };

  const record = await createExecution(userDO, {
    executionKey,
    workflowId: resolved.workflowId,
    workflowOwnerId: resolved.ownerId,
    workflowName: persisted.meta.workflowName || undefined,
    input,
    state: JSON.stringify(persisted),
  });

  const result = await runEngine({ c, bindingName, user, userDO, persisted });
  await persistResult(userDO, record.id, persisted, result);

  return {
    status: result.status,
    executionKey,
    workflowId: resolved.workflowId,
    workflowOwnerId: resolved.ownerId,
    output: result.output,
    steps: persisted.engine.steps,
    totalCostVnd: persisted.engine.totalCostVnd,
    pendingNodeId: result.pendingNodeId,
  };
}

/**
 * Resume a paused (pending_human) execution with an approve/reject decision,
 * continuing from the persisted engine snapshot.
 */
export async function resumeWorkflowExecution(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  executionKey: string;
  approved: boolean;
  note?: string;
}): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, executionKey, approved, note } = params;
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;

  const record = await getExecutionByKey(userDO, executionKey);
  if (!record) throw new Error('Execution not found');
  if (record.status !== 'pending_human') {
    throw new Error(`Execution is not awaiting review (status: ${record.status})`);
  }

  const persisted = JSON.parse(record.state) as PersistedState;
  const pendingNodeId = record.pendingNodeId;
  if (!pendingNodeId) throw new Error('Execution has no pending node to resume');

  // Mark the run as active again while we continue.
  await updateExecution(userDO, record.id, { status: 'running', pendingNodeId: '' });

  const result = await runEngine({
    c,
    bindingName,
    user,
    userDO,
    persisted,
    decision: { nodeId: pendingNodeId, approved, note },
  });
  await persistResult(userDO, record.id, persisted, result);

  return {
    status: result.status,
    executionKey,
    workflowId: persisted.meta.workflowId,
    workflowOwnerId: persisted.meta.ownerId,
    output: result.output,
    steps: persisted.engine.steps,
    totalCostVnd: persisted.engine.totalCostVnd,
    pendingNodeId: result.pendingNodeId,
  };
}
