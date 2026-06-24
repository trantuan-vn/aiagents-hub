import type { WorkflowDefinition, WorkflowNodeTypeSchema } from '../domain/domain.js';
import type { z } from 'zod';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { workflowAttribution } from '../execution/workflow-context.js';
import { getIdFromName } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import {
  createExecution,
  getExecutionByKey,
  updateExecution,
} from '../execution/execution-store.js';
import { nodePluginRegistry } from '../nodes/index.js';
import type { NodeContext as PluginNodeContext } from '../nodes/types.js';
import { buildWebhookItemOutput } from '../nodes/webhook/output.js';
import { isWebhookIngressNode } from '../triggers/triggers.js';
import {
  activeHandlesForNode,
  isEdgeActiveForBranches,
} from './flow-helpers.js';
import {
  isLoopOverItemsNode,
  resetLoopSubgraphVisited,
  type LoopState,
} from './loop-helpers.js';
import {
  gatherMainFlowInputs,
  getIncomingDataFlowEdges,
  getOutgoingDataFlowEdges,
  getWorkflowEntryNodeIds,
  isDataFlowEdge,
  isMergeFlowNode,
  isNonExecutableNodeType,
  mergeMode,
  mergeParentsReady,
} from './graph-helpers.js';

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
  /** When set, only these entry nodes are queued (e.g. a specific webhook trigger). */
  entryNodeIds?: string[];
  /** Parsed HTTP webhook payload — seeds webhook node output (n8n item shape). */
  webhookItem?: import('../nodes/webhook/output.js').BuildWebhookItemParams;
  /** Merge into initial runContext (form trigger fan-out per-table payload). */
  runContextOverride?: Record<string, unknown>;
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
  /** Nodes ready to run (graph traversal). */
  queue: string[];
  /** Completed node ids. */
  visited: string[];
  /** Nodes skipped (inactive branch). */
  skipped: string[];
  outputs: Record<string, NodeOutput>;
  steps: ExecutionStepLog[];
  runContext: NodeOutput;
  totalCostVnd: number;
  finalOutput?: unknown;
  /** Loop Over Items — persisted batch state per loop node. */
  loopStates?: Record<string, LoopState>;
  /** Pending loop return (set when loop branch feeds back into the loop node). */
  pendingLoopReturn?: { loopNodeId: string; returnOutput: NodeOutput };
  /** @deprecated legacy linear runs — migrated on resume */
  order?: string[];
  cursor?: number;
}

interface PersistedState {
  definition: WorkflowDefinition;
  meta: EngineMeta;
  input?: string;
  variables: Record<string, unknown>;
  autoApproveHumanReview: boolean;
  requestMeta?: { userAgent?: string; ipAddress?: string };
  webhookItem?: import('../nodes/webhook/output.js').BuildWebhookItemParams;
  engine: EngineState;
}

export interface HumanDecision {
  nodeId: string;
  approved: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Graph helpers — main-flow vs resource edges (see graph-helpers.ts)
// ---------------------------------------------------------------------------

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
  webhookItem?: import('../nodes/webhook/output.js').BuildWebhookItemParams;
  runContext: NodeOutput;
  definition: WorkflowDefinition;
  outputs: Record<string, NodeOutput>;
}

async function executeNodeLogic(
  node: WorkflowDefinition['nodes'][number],
  nodeInput: NodeOutput,
  ctx: NodeContext,
  onCost: (vnd: number) => void,
): Promise<NodeOutput> {
  const plugin = nodePluginRegistry.resolve(node);
  if (!plugin) throw new Error(`Unknown node type: ${node.type}`);

  if (isWebhookIngressNode(node) && ctx.webhookItem) {
    const hasMainParents = ctx.definition.edges.some(
      (e) => e.target === node.id && isDataFlowEdge(e),
    );
    if (!hasMainParents) {
      return buildWebhookItemOutput(ctx.webhookItem) as NodeOutput;
    }
  }

  if (plugin.skipExecution) return nodeInput;
  if (!plugin.execute) throw new Error(`Node ${plugin.id} has no execute handler`);

  const pluginCtx: PluginNodeContext = {
    node,
    nodeInput,
    definition: ctx.definition,
    outputs: ctx.outputs,
    runContext: ctx.runContext,
    input: ctx.input,
    c: ctx.c,
    bindingName: ctx.bindingName,
    user: ctx.user,
    userDO: ctx.userDO,
    meta: ctx.meta,
    attr: ctx.attr,
    requestMeta: ctx.requestMeta,
    webhookItem: ctx.webhookItem,
    onCost,
  };
  return plugin.execute(pluginCtx);
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

function migrateEngineState(engine: EngineState, definition: WorkflowDefinition): void {
  engine.visited = engine.visited ?? engine.steps?.map((s) => s.nodeId) ?? [];
  engine.skipped = engine.skipped ?? [];
  engine.loopStates = engine.loopStates ?? {};
  if (engine.queue?.length) return;
  if (engine.order?.length && engine.cursor != null) {
    const remaining = engine.order.slice(engine.cursor);
    engine.queue = remaining.filter((id) => !engine.visited.includes(id));
    return;
  }
  engine.queue = getWorkflowEntryNodeIds(definition);
  engine.visited = engine.visited ?? [];
  engine.skipped = engine.skipped ?? [];
}

function enqueueNode(engine: EngineState, nodeId: string): void {
  if (engine.visited.includes(nodeId)) return;
  if (engine.skipped.includes(nodeId)) return;
  if (engine.queue.includes(nodeId)) return;
  engine.queue.push(nodeId);
}

function mergeCanRun(
  nodeId: string,
  definition: WorkflowDefinition,
  engine: EngineState,
): boolean {
  const parents = getIncomingDataFlowEdges(definition, nodeId).map((e) => e.source);
  if (!parents.length) return true;
  return parents.every(
    (p) => engine.outputs[p] !== undefined || engine.skipped.includes(p),
  );
}

function scheduleDownstream(
  definition: WorkflowDefinition,
  sourceNode: WorkflowDefinition['nodes'][number],
  sourceOutput: NodeOutput,
  scope: Record<string, unknown>,
  engine: EngineState,
  nodeById: Map<string, WorkflowDefinition['nodes'][number]>,
): void {
  const activeHandles = activeHandlesForNode(sourceNode, sourceOutput, {
    ...scope,
    ...sourceOutput,
  });

  const outgoing = getOutgoingDataFlowEdges(definition, sourceNode.id);

  for (const edge of outgoing) {
    const handle = edge.sourceHandle ?? 'out';
    const active = isEdgeActiveForBranches(handle, activeHandles, sourceNode.type);

    if (!active) {
      continue;
    }

    const target = nodeById.get(edge.target);
    if (!target || isNonExecutableNodeType(target.type)) continue;

    // Loop branch feeds back into an already-visited Loop Over Items node.
    if (
      isLoopOverItemsNode(target) &&
      engine.visited.includes(target.id) &&
      (edge.targetHandle ?? 'in') === 'in'
    ) {
      engine.pendingLoopReturn = {
        loopNodeId: target.id,
        returnOutput: sourceOutput,
      };
      engine.visited = resetLoopSubgraphVisited(definition, target.id, engine.visited);
      enqueueNode(engine, target.id);
      continue;
    }

    if (isMergeFlowNode(target)) {
      const mode = mergeMode(target);
      if (mode === 'wait_all') {
        if (mergeCanRun(target.id, definition, engine)) {
          enqueueNode(engine, target.id);
        }
      } else {
        enqueueNode(engine, target.id);
      }
    } else {
      enqueueNode(engine, target.id);
    }
  }
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
    webhookItem: persisted.webhookItem,
    runContext: engine.runContext,
    definition,
    outputs: engine.outputs,
  };

  migrateEngineState(engine, definition);

  while (engine.queue.length > 0) {
    const nodeId = engine.queue.shift()!;
    if (engine.visited.includes(nodeId) || engine.skipped.includes(nodeId)) continue;

    const node = nodeById.get(nodeId);
    if (!node || isNonExecutableNodeType(node.type)) {
      engine.visited.push(nodeId);
      continue;
    }

    if (isMergeFlowNode(node) && mergeMode(node) === 'wait_all' && !mergeCanRun(nodeId, definition, engine)) {
      if (engine.queue.length === 0) {
        engine.skipped.push(nodeId);
        continue;
      }
      engine.queue.push(nodeId);
      continue;
    }

    const nodeInput = gatherMainFlowInputs(nodeId, definition.edges, engine.outputs);
    const started = Date.now();
    const log: ExecutionStepLog = {
      nodeId,
      nodeType: node.type,
      status: 'success',
      input: nodeInput,
    };

    const pendingLoop = engine.pendingLoopReturn;
    const isLoopReturn =
      isLoopOverItemsNode(node) &&
      pendingLoop?.loopNodeId === nodeId;
    if (isLoopReturn) {
      engine.pendingLoopReturn = undefined;
    }

    engine.runContext._loopStates = engine.loopStates ?? {};
    if (isLoopReturn) {
      engine.runContext._loop = {
        nodeId,
        isReturn: true,
        returnOutput: pendingLoop!.returnOutput,
      };
    } else {
      delete engine.runContext._loop;
    }

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
      engine.visited.push(nodeId);
      scheduleDownstream(definition, node, out, {
        input: persisted.input ?? '',
        variables: engine.runContext.variables ?? {},
      }, engine, nodeById);
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

      if (isLoopOverItemsNode(node)) {
        const loopState = out._loopState as LoopState | null | undefined;
        engine.loopStates = engine.loopStates ?? {};
        if (loopState) {
          engine.loopStates[nodeId] = loopState;
        } else {
          delete engine.loopStates[nodeId];
        }
        const { _loopState, ...publicOut } = out;
        engine.outputs[nodeId] = publicOut;
        log.output = publicOut;
        engine.finalOutput = publicOut;
      }

      engine.visited.push(nodeId);
      delete engine.runContext._loop;
      delete engine.runContext._loopStates;
      scheduleDownstream(definition, node, engine.outputs[nodeId], {
        input: persisted.input ?? '',
        variables: engine.runContext.variables ?? {},
      }, engine, nodeById);
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
  const initialQueue =
    params.entryNodeIds?.length
      ? params.entryNodeIds
      : getWorkflowEntryNodeIds(definition);

  if (params.entryNodeIds?.length) {
    const nodeIds = new Set(definition.nodes.map((n) => n.id));
    const missing = params.entryNodeIds.filter((id) => !nodeIds.has(id));
    if (missing.length) {
      return {
        status: 'failed',
        executionKey: crypto.randomUUID(),
        workflowId: resolved.workflowId,
        workflowOwnerId: resolved.ownerId,
        output: { error: `Entry node not found: ${missing.join(', ')}` },
        steps: [],
        totalCostVnd: 0,
      };
    }
  }

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
    webhookItem: params.webhookItem,
    engine: {
      queue: initialQueue,
      visited: [],
      skipped: [],
      outputs: {},
      steps: [],
      runContext: {
        input: input ?? '',
        variables,
        workflowName: resolved.workflow.name,
        ...(params.runContextOverride ?? {}),
      },
      totalCostVnd: 0,
      loopStates: {},
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
