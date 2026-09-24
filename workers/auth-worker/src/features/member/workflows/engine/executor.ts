import type { WorkflowDefinition, WorkflowNodeTypeSchema } from '../domain/domain.js';
import type { z } from 'zod';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { workflowAttribution, resolveWorkflow } from '../execution/workflow-context.js';
import { getIdFromName } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import {
  createExecution,
  getExecutionByKey,
  updateExecution,
  type ExecutionRow,
} from '../execution/execution-store.js';
import { broadcastWorkflowExecutionProgress } from '../execution/execution-progress.js';
import { nodePluginRegistry } from '../nodes/index.js';
import type { NodeContext as PluginNodeContext } from '../nodes/types.js';
import { buildWebhookItemOutput } from '../nodes/webhook/output.js';
import { isWebhookIngressNode } from '../triggers/triggers.js';
import {
  activeHandlesForNode,
  isEdgeActiveForBranches,
} from './flow-helpers.js';
import {
  executeLoopOverItems,
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
  isEmptyNodeInput,
  isMergeFlowNode,
  isNonExecutableNode,
  mergeMode,
  parseWorkflowExecuteInput,
} from './graph-helpers.js';
import {
  hasRunnableSiblingWork,
  queueAfterHumanReviewPause,
  queueAfterHumanReviewResume,
} from './human-review-queue.js';
import {
  isTruncatedStub,
  serializePersistedState,
  serializeOutputSummary,
  clipValue,
} from './persist-state.js';
import { isStoppableExecutionStatus, persistStatusHonoringCancel } from './cancel-helpers.js';
import { incrementSharedWorkflowUsage } from '../billing/royalty.js';
import { consumeDailyWorkflowRun, loadUserAndSyncPlan } from '../billing/billing.js';
import { runnerMeetsMinPlan } from '../billing/plan.js';
import {
  executionHistoryLimitsFromEntitlement,
  pruneWorkflowExecutionHistory,
} from '../execution/execution-retention.js';
import { evaluateWorkflowRunFairness } from '../../../ws/infrastructure/scale-safety.js';
import { enqueueWorkflowContinue } from '../execution/workflow-continue.js';
import { pipelineItems } from '../nodes/tool/shared/pipeline.js';

/** Wall-clock budget per durable slice (form / continue alarm). */
export const DURABLE_SLICE_WALL_MS = 18_000;
const PROGRESS_OUTPUT_BUDGET = 24_000;

type NodeType = z.infer<typeof WorkflowNodeTypeSchema>;

export interface ExecutionStepLog {
  nodeId: string;
  nodeType: NodeType;
  status: 'success' | 'error' | 'skipped' | 'pending_human';
  input?: unknown;
  output?: unknown;
  error?: string;
  costVnd?: number;
  royaltyUsd?: number;
  durationMs?: number;
  /** Number of attempts taken (>1 means the node was retried). */
  attempts?: number;
}

export interface WorkflowExecutionResult {
  status: 'completed' | 'failed' | 'pending_human' | 'cancelled' | 'running';
  executionKey: string;
  workflowId: number;
  workflowOwnerId: string;
  output?: unknown;
  steps: ExecutionStepLog[];
  totalCostVnd: number;
  totalCreditsCharged?: number;
  totalCreditsRoyalty?: number;
  /** Royalty portion of totalCostVnd, deducted from consumer A for owner B. */
  totalRoyaltyUsd?: number;
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
  triggerKind?: string;
  /**
   * Yield after Save RAG / wall budget so DO alarm can continue.
   * Used by form durable slices; interactive execute leaves this off.
   */
  durableSlices?: boolean;
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
  totalRoyaltyUsd?: number;
  finalOutput?: unknown;
  /** Loop Over Items — persisted batch state per loop node. */
  loopStates?: Record<string, LoopState>;
  /** Pending loop return (set when loop branch feeds back into the loop node). */
  pendingLoopReturn?: { loopNodeId: string; returnOutput: NodeOutput };
  /** Trigger / entry node that started this run (for live canvas highlighting). */
  entryNodeId?: string;
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
  /** Oversized node I/O was compacted; resume still has queue/visited. */
  ioTruncated?: boolean;
  /** Alias of ioTruncated for API clarity (Phase 0). */
  ioClipped?: boolean;
  /** Core kept but I/O / loop items heavily slimmed. */
  persistDegraded?: boolean;
  /** Which compaction step produced this snapshot. */
  clipPolicy?: string;
  schemaVersion?: number;
  /** Nested persist metadata (Phase 1). */
  persistMeta?: {
    schemaVersion: number;
    ioClipped: boolean;
    persistDegraded: boolean;
    clipPolicy: string;
    hotBytes: number;
  };
  /** Graph was dropped to fit storage; resume reloads the live workflow. */
  definitionOmitted?: boolean;
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
function isNonRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /timed out|timeout|AbortError|TimeoutError/i.test(message);
}

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
      if (isNonRetryableError(e)) break;
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
  onCost: (chargedUsd: number, royaltyUsd?: number) => void,
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
  executionKey: string;
  decision?: HumanDecision;
  /** Yield after heavy nodes / wall budget (form continue slices). */
  durableSlices?: boolean;
  /** Skip progress `started` when resuming a slice (avoid flicker). */
  skipStarted?: boolean;
}

interface RunEngineResult {
  status: WorkflowExecutionResult['status'] | 'continuing';
  output?: unknown;
  pendingNodeId?: string;
}

function isSaveRagToolNode(node: WorkflowDefinition['nodes'][number]): boolean {
  if (node.type !== 'tool_node') return false;
  return String((node.data ?? {}).toolKind ?? '') === 'save-rag';
}

function progressOutput(output: unknown): unknown {
  return clipValue(output, PROGRESS_OUTPUT_BUDGET);
}

function shouldYieldSlice(
  durableSlices: boolean,
  sliceStartedAt: number,
  node: WorkflowDefinition['nodes'][number],
  queueLength: number,
): boolean {
  if (!durableSlices || queueLength <= 0) return false;
  if (isSaveRagToolNode(node)) return true;
  return Date.now() - sliceStartedAt >= DURABLE_SLICE_WALL_MS;
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
  // An in-flight snapshot (pause/resume) must not restart from entry nodes —
  // that would re-run Get DB Info after Approve on a terminal Gmail review.
  if (engine.visited.length || engine.steps?.length) {
    engine.queue = [];
    return;
  }
  engine.queue = getWorkflowEntryNodeIds(definition);
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
    if (!target || isNonExecutableNode(target, definition)) continue;

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
  const { c, bindingName, user, userDO, persisted, executionKey } = args;
  const { definition, meta, engine } = persisted;
  let { decision } = args;
  const durableSlices = !!args.durableSlices;
  const sliceStartedAt = Date.now();

  const emitProgress = async (
    event: Omit<Parameters<typeof broadcastWorkflowExecutionProgress>[1], 'workflowId' | 'executionKey'>,
  ) => {
    await broadcastWorkflowExecutionProgress(userDO, {
      workflowId: meta.workflowId,
      executionKey,
      ...event,
      entryNodeId: event.entryNodeId || engine.entryNodeId,
    });
  };

  const emitNodeDone = async (
    nodeId: string,
    status: NonNullable<Parameters<typeof broadcastWorkflowExecutionProgress>[1]['status']>,
    output?: unknown,
  ) => {
    await emitProgress({
      type: 'node_done',
      nodeId,
      status,
      ...(output !== undefined ? { output: progressOutput(output) } : {}),
    });
  };

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
  if (decision?.nodeId) {
    engine.queue = queueAfterHumanReviewResume(engine.queue, decision.nodeId, nodeById);
  }
  engine.entryNodeId = engine.entryNodeId || engine.queue[0] || decision?.nodeId;

  if (!args.skipStarted) {
    await emitProgress({ type: 'started', nodeId: engine.entryNodeId, status: 'running' });
  }

  while (engine.queue.length > 0) {
    const live = await getExecutionByKey(userDO, executionKey);
    if (live?.status === 'cancelled') {
      await emitProgress({ type: 'finished', status: 'cancelled' });
      return { status: 'cancelled', output: engine.finalOutput ?? { stopped: true } };
    }
    // Stall watchdog (or continue-dispatch error) marked failed while this
    // slice was still alive — stop between nodes so we do not resurrect it.
    if (live?.status === 'failed') {
      await emitProgress({ type: 'finished', status: 'failed' });
      return {
        status: 'failed',
        output: { error: live.error || 'Execution failed', stopped: true },
      };
    }

    const nodeId = engine.queue.shift()!;
    if (engine.visited.includes(nodeId) || engine.skipped.includes(nodeId)) continue;

    const node = nodeById.get(nodeId);
    if (!node || isNonExecutableNode(node, definition)) {
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

    const gathered = gatherMainFlowInputs(nodeId, definition.edges, engine.outputs);
    const fallback = parseWorkflowExecuteInput(persisted.input);
    const nodeInput =
      isEmptyNodeInput(gathered) && Object.keys(fallback).length
        ? { ...fallback, parents: gathered.parents }
        : gathered;
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

    // Send-and-wait must not pause while sibling nodes (Get DB Info / Save RAG) can still run.
    if (
      node.type === 'human_review' &&
      !(decision && decision.nodeId === nodeId) &&
      !persisted.autoApproveHumanReview &&
      hasRunnableSiblingWork({
        queue: engine.queue,
        definition,
        nodeById,
        engine,
        exceptNodeId: nodeId,
      })
    ) {
      engine.queue.push(nodeId);
      continue;
    }

    await emitProgress({ type: 'node_start', nodeId, status: 'running' });

    // --- human review: flow control + pause/resume ---
    if (node.type === 'human_review') {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const matchedDecision = decision && decision.nodeId === nodeId ? decision : undefined;

      if (!matchedDecision && !persisted.autoApproveHumanReview) {
        // Channel side-effects (e.g. Gmail send) run once before pausing.
        const plugin = nodePluginRegistry.resolve(node);
        let channelOut: NodeOutput = {};
        if (plugin?.execute && !plugin.skipExecution) {
          try {
            const pluginCtx: PluginNodeContext = {
              node,
              nodeInput,
              definition,
              outputs: engine.outputs,
              runContext: engine.runContext,
              input: persisted.input,
              c,
              bindingName,
              user,
              userDO,
              meta,
              attr,
              requestMeta: persisted.requestMeta,
              webhookItem: persisted.webhookItem,
            };
            channelOut = await plugin.execute(pluginCtx);
          } catch (e) {
            log.status = 'error';
            log.error = e instanceof Error ? e.message : String(e);
            log.output = { error: log.error };
            engine.steps.push({ ...log, durationMs: Date.now() - started });
            engine.outputs[nodeId] = log.output as NodeOutput;
            engine.finalOutput = log.output;
            await emitNodeDone(nodeId, 'error', log.output);
            await emitProgress({ type: 'finished', nodeId, status: 'failed' });
            return { status: 'failed', output: { error: log.error, lastNode: nodeId } };
          }
        }

        log.status = 'pending_human';
        log.output = {
          message: String(data.message ?? 'Awaiting human approval'),
          payload: nodeInput,
          ...channelOut,
        };
        engine.steps.push({ ...log, durationMs: Date.now() - started });
        engine.outputs[nodeId] = log.output as NodeOutput;
        engine.finalOutput = log.output;
        await emitNodeDone(nodeId, 'pending_human', log.output);
        await emitProgress({ type: 'finished', nodeId, status: 'pending_human' });
        // Keep other human_review waits; drop leftover siblings so Approve
        // only continues nodes wired after this one.
        engine.queue = queueAfterHumanReviewPause(engine.queue, nodeById);
        return { status: 'pending_human', output: log.output, pendingNodeId: nodeId };
      }

      if (matchedDecision && matchedDecision.approved === false) {
        log.status = 'skipped';
        log.output = { approved: false, note: matchedDecision.note, rejectedAt: Date.now() };
        engine.steps.push({ ...log, durationMs: Date.now() - started });
        engine.outputs[nodeId] = log.output as NodeOutput;
        engine.finalOutput = log.output;
        await emitNodeDone(nodeId, 'skipped', log.output);
        await emitProgress({ type: 'finished', nodeId, status: 'cancelled' });
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
      await emitNodeDone(nodeId, 'success', out);
      scheduleDownstream(definition, node, out, {
        input: persisted.input ?? '',
        variables: engine.runContext.variables ?? {},
      }, engine, nodeById);
      if (shouldYieldSlice(durableSlices, sliceStartedAt, node, engine.queue.length)) {
        return { status: 'continuing', output: engine.finalOutput };
      }
      continue;
    }

    // --- all other node types: execute with retry ---
    try {
      const { value: out, attempts } = await withRetry(
        (node.data ?? {}) as Record<string, unknown>,
        () =>
          executeNodeLogic(node, nodeInput, ctx, (chargedUsd, royaltyUsd = 0) => {
            engine.totalCostVnd += chargedUsd;
            engine.totalRoyaltyUsd = (engine.totalRoyaltyUsd ?? 0) + royaltyUsd;
            log.costVnd = (log.costVnd ?? 0) + chargedUsd;
            log.royaltyUsd = (log.royaltyUsd ?? 0) + royaltyUsd;
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
      await emitNodeDone(nodeId, 'success', engine.outputs[nodeId]);
      scheduleDownstream(definition, node, engine.outputs[nodeId], {
        input: persisted.input ?? '',
        variables: engine.runContext.variables ?? {},
      }, engine, nodeById);
      if (shouldYieldSlice(durableSlices, sliceStartedAt, node, engine.queue.length)) {
        return { status: 'continuing', output: engine.finalOutput };
      }
    } catch (e) {
      log.status = 'error';
      log.error = String(e instanceof Error ? e.message : e).slice(0, 2000);
      log.output = { error: log.error };
      engine.steps.push({ ...log, durationMs: Date.now() - started });
      engine.outputs[nodeId] = log.output as NodeOutput;
      engine.finalOutput = log.output;
      await emitNodeDone(nodeId, 'error', log.output);
      await emitProgress({ type: 'finished', nodeId, status: 'failed' });
      return { status: 'failed', output: { error: log.error, lastNode: nodeId } };
    }
  }

  await emitProgress({ type: 'finished', status: 'completed' });
  return { status: 'completed', output: engine.finalOutput };
}

/** Persist the latest engine snapshot + result onto the execution record. */
async function persistResult(
  userDO: DurableObjectStub<UserDO>,
  executionId: number,
  persisted: PersistedState,
  result: RunEngineResult,
  executionKey: string,
): Promise<void> {
  const current = await getExecutionByKey(userDO, executionKey);
  const mappedStatus: WorkflowExecutionResult['status'] =
    result.status === 'continuing' ? 'running' : result.status;
  const status = persistStatusHonoringCancel(current?.status, mappedStatus);
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
  await updateExecution(userDO, executionId, {
    status,
    state: serializePersistedState(persisted as unknown as Record<string, unknown>),
    output: serializeOutputSummary(result.output),
    totalCostVnd: persisted.engine.totalCostVnd,
    totalCreditsCharged: persisted.engine.totalCostVnd,
    totalCreditsRoyalty: persisted.engine.totalRoyaltyUsd ?? 0,
    totalRoyaltyUsd: persisted.engine.totalRoyaltyUsd ?? 0,
    stepCount: persisted.engine.steps.length,
    pendingNodeId: status === 'cancelled' ? '' : (result.pendingNodeId ?? ''),
    error:
      status === 'failed'
        ? String((result.output as any)?.error ?? 'failed').slice(0, 2000)
        : undefined,
    finishedAt: terminal ? (current?.finishedAt || Date.now()) : undefined,
  });
}

/** Persist failed: mark the run failed so we never silent-continue on stale DO state. */
async function persistOrFailRun(
  userDO: DurableObjectStub<UserDO>,
  executionId: number,
  persisted: PersistedState,
  result: RunEngineResult,
  executionKey: string,
  logLabel: string,
): Promise<RunEngineResult> {
  try {
    await persistResult(userDO, executionId, persisted, result, executionKey);
    return result;
  } catch (e) {
    const message = `Persist failed: ${String(e instanceof Error ? e.message : e)}`.slice(0, 2000);
    console.error(`[${logLabel}] ${message}`);
    try {
      await updateExecution(userDO, executionId, {
        status: 'failed',
        error: message,
        finishedAt: Date.now(),
        pendingNodeId: '',
      });
    } catch (inner) {
      console.error(
        `[${logLabel}] could not mark execution failed after persist error:`,
        inner instanceof Error ? inner.message : inner,
      );
    }
    try {
      await broadcastWorkflowExecutionProgress(userDO, {
        workflowId: persisted.meta.workflowId,
        executionKey,
        type: 'finished',
        status: 'failed',
      });
    } catch {
      /* best-effort */
    }
    return { status: 'failed', output: { error: message } };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type PreparedRun =
  | { ok: false; result: WorkflowExecutionResult }
  | {
      ok: true;
      executionKey: string;
      userDO: DurableObjectStub<UserDO>;
      persisted: PersistedState;
      record: { id: number };
    };

async function prepareWorkflowExecution(params: ExecuteWorkflowParams): Promise<PreparedRun> {
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
        ok: false,
        result: {
          status: 'failed',
          executionKey: crypto.randomUUID(),
          workflowId: resolved.workflowId,
          workflowOwnerId: resolved.ownerId,
          output: { error: `Entry node not found: ${missing.join(', ')}` },
          steps: [],
          totalCostVnd: 0,
        },
      };
    }
  }

  if (!definition.nodes.length) {
    return {
      ok: false,
      result: {
        status: 'failed',
        executionKey,
        workflowId: resolved.workflowId,
        workflowOwnerId: resolved.ownerId,
        output: { error: 'Workflow has no nodes' },
        steps: [],
        totalCostVnd: 0,
      },
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
      entryNodeId: initialQueue[0],
    },
  };

  try {
    const { quota } = await loadUserAndSyncPlan(userDO, c.env);
    const minPlanId = resolved.workflow.minPlanId ?? resolved.workflow.min_plan_id ?? 'free';
    if (!resolved.isOwnedByUser && !runnerMeetsMinPlan(quota.planId, minPlanId)) {
      return {
        ok: false,
        result: {
          status: 'failed',
          executionKey,
          workflowId: resolved.workflowId,
          workflowOwnerId: resolved.ownerId,
          output: {
            error: `Plan ${minPlanId} required`,
            code: 'PLAN_REQUIRED',
            minPlanId,
            checkoutPath: '/packages',
          },
          steps: [],
          totalCostVnd: 0,
        },
      };
    }
    const triggerKind = params.triggerKind ?? (params.webhookItem ? 'webhook' : 'manual');
    if (resolved.isOwnedByUser) {
      if (triggerKind === 'cron' && !quota.entitlement.canUseCron) {
        return {
          ok: false,
          result: {
            status: 'failed',
            executionKey,
            workflowId: resolved.workflowId,
            workflowOwnerId: resolved.ownerId,
            output: { error: 'PLAN_FEATURE', code: 'PLAN_FEATURE', checkoutPath: '/packages' },
            steps: [],
            totalCostVnd: 0,
          },
        };
      }
      if (
        (triggerKind === 'webhook' || triggerKind === 'telegram' || triggerKind === 'slack' || triggerKind === 'discord') &&
        !quota.entitlement.canUseWebhooks
      ) {
        return {
          ok: false,
          result: {
            status: 'failed',
            executionKey,
            workflowId: resolved.workflowId,
            workflowOwnerId: resolved.ownerId,
            output: { error: 'PLAN_FEATURE', code: 'PLAN_FEATURE', checkoutPath: '/packages' },
            steps: [],
            totalCostVnd: 0,
          },
        };
      }
    }
    await consumeDailyWorkflowRun(userDO, c.env, {
      triggerKind,
      graceWhenExhausted: resolved.workflow.graceWhenExhausted === true || resolved.workflow.graceWhenExhausted === 1,
      workflowId: resolved.workflowId,
    });

    // Phase A/B: fairness — hard reject / soft throttle when DO queue overloaded.
    try {
      const healthRes = await userDO.fetch('https://user.do/queue/health', { method: 'GET' });
      if (healthRes.ok) {
        const health = (await healthRes.json()) as {
          backpressure?: boolean;
          softExceeded?: boolean;
          pendingTotal?: number;
          lastWorkflowRunAt?: number | null;
          caps?: { hardPerUser?: number; softPerUser?: number };
        };
        const decision = evaluateWorkflowRunFairness({
          pendingTotal: Number(health.pendingTotal ?? 0) || 0,
          softPerUser: health.caps?.softPerUser,
          hardPerUser: health.caps?.hardPerUser,
          lastRunAt: health.lastWorkflowRunAt ?? null,
        });
        if (decision.action === 'reject') {
          return {
            ok: false,
            result: {
              status: 'failed',
              executionKey,
              workflowId: resolved.workflowId,
              workflowOwnerId: resolved.ownerId,
              output: {
                error: 'BACKPRESSURE: queue overloaded — try again shortly',
                code: 'BACKPRESSURE',
                reason: 'backpressure',
                pendingTotal: health.pendingTotal ?? null,
              },
              steps: [],
              totalCostVnd: 0,
            },
          };
        }
        if (decision.action === 'throttle') {
          return {
            ok: false,
            result: {
              status: 'failed',
              executionKey,
              workflowId: resolved.workflowId,
              workflowOwnerId: resolved.ownerId,
              output: {
                error: `BACKPRESSURE_SOFT: slow down — retry in ~${Math.ceil(decision.waitMs / 1000)}s`,
                code: 'BACKPRESSURE_SOFT',
                reason: 'backpressure',
                waitMs: decision.waitMs,
                pendingTotal: health.pendingTotal ?? null,
              },
              steps: [],
              totalCostVnd: 0,
            },
          };
        }
      }
    } catch (e) {
      console.warn(
        '[prepareWorkflowExecution] pending-cap check failed:',
        e instanceof Error ? e.message : e,
      );
    }

    const record = await createExecution(userDO, {
      executionKey,
      workflowId: resolved.workflowId,
      workflowOwnerId: resolved.ownerId,
      workflowName: (persisted.meta.workflowName || undefined)?.slice(0, 200),
      input: typeof input === 'string' ? input.slice(0, 32_000) : undefined,
      state: serializePersistedState(persisted as unknown as Record<string, unknown>),
    });
    try {
      await userDO.fetch('https://user.do/queue/touch-workflow-run', { method: 'POST' });
    } catch {
      /* best-effort fairness timestamp */
    }
    try {
      await pruneWorkflowExecutionHistory(
        userDO,
        resolved.workflowId,
        executionHistoryLimitsFromEntitlement(quota.entitlement),
      );
    } catch (e) {
      console.warn('[prepareWorkflowExecution] prune failed:', e instanceof Error ? e.message : e);
    }
    return { ok: true, executionKey, userDO, persisted, record };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      result: {
        status: 'failed',
        executionKey,
        workflowId: resolved.workflowId,
        workflowOwnerId: resolved.ownerId,
        output: { error: message.slice(0, 2000) },
        steps: [],
        totalCostVnd: 0,
      },
    };
  }
}

function toPublicResult(
  result: RunEngineResult,
  executionKey: string,
  persisted: PersistedState,
): WorkflowExecutionResult {
  const status: WorkflowExecutionResult['status'] =
    result.status === 'continuing' ? 'running' : result.status;
  return {
    status,
    executionKey,
    workflowId: persisted.meta.workflowId,
    workflowOwnerId: persisted.meta.ownerId,
    output: result.output,
    steps: persisted.engine.steps,
    totalCostVnd: persisted.engine.totalCostVnd,
    totalCreditsCharged: persisted.engine.totalCostVnd,
    totalCreditsRoyalty: persisted.engine.totalRoyaltyUsd ?? 0,
    totalRoyaltyUsd: persisted.engine.totalRoyaltyUsd ?? 0,
    pendingNodeId: result.pendingNodeId,
  };
}

/** Create the execution record + snapshot without running nodes (form kick). */
export async function startWorkflowExecution(
  params: ExecuteWorkflowParams,
): Promise<WorkflowExecutionResult> {
  const prepared = await prepareWorkflowExecution(params);
  if (!prepared.ok) return prepared.result;

  const { executionKey, userDO, persisted } = prepared;
  await broadcastWorkflowExecutionProgress(userDO, {
    workflowId: persisted.meta.workflowId,
    executionKey,
    type: 'started',
    nodeId: persisted.engine.entryNodeId,
    status: 'running',
    entryNodeId: persisted.engine.entryNodeId,
  });

  return {
    status: 'running',
    executionKey,
    workflowId: persisted.meta.workflowId,
    workflowOwnerId: persisted.meta.ownerId,
    steps: [],
    totalCostVnd: 0,
  };
}

export async function executeWorkflowGraph(
  params: ExecuteWorkflowParams,
): Promise<WorkflowExecutionResult> {
  const prepared = await prepareWorkflowExecution(params);
  if (!prepared.ok) return prepared.result;

  const { c, bindingName, user, resolved } = params;
  const { executionKey, userDO, persisted, record } = prepared;

  let result: RunEngineResult;
  try {
    result = await runEngine({
      c,
      bindingName,
      user,
      userDO,
      persisted,
      executionKey,
      durableSlices: params.durableSlices,
    });
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).slice(0, 2000);
    result = { status: 'failed', output: { error: message } };
  }
  result = await persistOrFailRun(
    userDO,
    record.id,
    persisted,
    result,
    executionKey,
    'executeWorkflowGraph',
  );

  if (!resolved.isOwnedByUser) {
    try {
      await incrementSharedWorkflowUsage(c.env, bindingName, resolved.workflowId, resolved.ownerId);
    } catch (e) {
      console.warn(
        '[executeWorkflowGraph] usage count failed:',
        e instanceof Error ? e.message : e,
      );
    }
  }

  return toPublicResult(result, executionKey, persisted);
}

/**
 * Advance a durable (form) execution by one slice. Caller re-enqueues when
 * status is `running` and work remains.
 */
export async function continueWorkflowExecution(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  executionKey: string;
  runnerDoIdString?: string;
}): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, executionKey } = params;
  const userDO = resolveRunnerDO(c, bindingName, user.identifier, params.runnerDoIdString);

  const record = await getExecutionByKey(userDO, executionKey);
  if (!record) throw new Error('Execution not found');
  if (record.status === 'cancelled') {
    return {
      status: 'cancelled',
      executionKey,
      workflowId: record.workflowId,
      workflowOwnerId: record.workflowOwnerId,
      steps: [],
      totalCostVnd: record.totalCostVnd ?? 0,
    };
  }
  if (record.status !== 'running') {
    return {
      status: record.status as WorkflowExecutionResult['status'],
      executionKey,
      workflowId: record.workflowId,
      workflowOwnerId: record.workflowOwnerId,
      steps: [],
      totalCostVnd: record.totalCostVnd ?? 0,
    };
  }

  let rawState: unknown;
  try {
    rawState = JSON.parse(record.state || '{}') as unknown;
  } catch {
    rawState = {};
  }

  const persisted = await resolvePersistedForResume({
    c,
    bindingName,
    user,
    record,
    rawState,
    pendingNodeId: record.pendingNodeId || '',
    preferEntryNodesWhenEmpty: true,
  });

  if (!persisted.engine || typeof persisted.engine !== 'object') {
    const message = 'Execution state missing; cannot continue';
    await updateExecution(userDO, record.id, {
      status: 'failed',
      error: message,
      finishedAt: Date.now(),
      pendingNodeId: '',
    });
    await broadcastWorkflowExecutionProgress(userDO, {
      workflowId: record.workflowId,
      executionKey,
      type: 'finished',
      status: 'failed',
    });
    return {
      status: 'failed',
      executionKey,
      workflowId: record.workflowId,
      workflowOwnerId: record.workflowOwnerId,
      output: { error: message },
      steps: [],
      totalCostVnd: record.totalCostVnd ?? 0,
    };
  }

  let result: RunEngineResult;
  try {
    result = await runEngine({
      c,
      bindingName,
      user,
      userDO,
      persisted,
      executionKey,
      durableSlices: true,
      skipStarted: true,
    });
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).slice(0, 2000);
    result = { status: 'failed', output: { error: message } };
    await broadcastWorkflowExecutionProgress(userDO, {
      workflowId: persisted.meta.workflowId,
      executionKey,
      type: 'finished',
      status: 'failed',
    });
  }

  result = await persistOrFailRun(
    userDO,
    record.id,
    persisted,
    result,
    executionKey,
    'continueWorkflowExecution',
  );

  return toPublicResult(result, executionKey, persisted);
}

async function resolvePersistedForResume(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  record: ExecutionRow;
  rawState: unknown;
  pendingNodeId: string;
  /** When rebuilding a stub with no pending node, queue workflow entry nodes. */
  preferEntryNodesWhenEmpty?: boolean;
}): Promise<PersistedState> {
  const { c, bindingName, user, record, rawState, pendingNodeId } = params;
  const stub = isTruncatedStub(rawState);
  const parsed = !stub && rawState && typeof rawState === 'object' ? (rawState as PersistedState) : undefined;
  const hasGraph = Array.isArray(parsed?.definition?.nodes) && parsed.definition.nodes.length > 0;
  const hasEngine = !!parsed?.engine;

  if (parsed && hasEngine && hasGraph) return parsed;

  console.warn(
    `[resume] reconstructing snapshot from live workflow ${record.workflowId}` +
      (stub
        ? ' (legacy truncated stub)'
        : parsed?.definitionOmitted
          ? ' (definition omitted)'
          : ' (incomplete snapshot)'),
  );

  const resolved = await resolveWorkflow(
    c,
    bindingName,
    user.identifier,
    record.workflowId,
    record.workflowOwnerId,
  );

  if (parsed?.engine && (parsed.definitionOmitted || !hasGraph)) {
    parsed.definition = resolved.definition;
    parsed.definitionOmitted = false;
    parsed.meta = parsed.meta ?? {
      ownerId: resolved.ownerId,
      workflowId: resolved.workflowId,
      isOwnedByUser: resolved.isOwnedByUser,
      workflowName: String(resolved.workflow.name ?? ''),
    };
    parsed.variables = parsed.variables ?? {};
    parsed.autoApproveHumanReview = parsed.autoApproveHumanReview ?? false;
    return parsed;
  }

  const entryQueue =
    pendingNodeId
      ? [pendingNodeId]
      : params.preferEntryNodesWhenEmpty
        ? getWorkflowEntryNodeIds(resolved.definition)
        : [];

  return {
    definition: resolved.definition,
    meta: {
      ownerId: resolved.ownerId,
      workflowId: resolved.workflowId,
      isOwnedByUser: resolved.isOwnedByUser,
      workflowName: String(resolved.workflow.name ?? ''),
    },
    input: record.input,
    variables: {},
    autoApproveHumanReview: false,
    engine: {
      queue: entryQueue,
      visited: [],
      skipped: [],
      outputs: {},
      steps: [],
      runContext: { input: record.input ?? '', variables: {} },
      totalCostVnd: record.totalCostVnd ?? 0,
      totalRoyaltyUsd: record.totalRoyaltyUsd ?? 0,
      loopStates: {},
    },
  };
}

/**
 * Resume a paused (pending_human) execution with an approve/reject decision.
 * If the stored snapshot was compacted or replaced by a legacy size stub,
 * reload the live workflow graph so Approve can still finish.
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

  const rawState = JSON.parse(record.state || '{}') as unknown;
  const pendingNodeId = record.pendingNodeId;
  if (!pendingNodeId) throw new Error('Execution has no pending node to resume');

  const persisted = await resolvePersistedForResume({
    c,
    bindingName,
    user,
    record,
    rawState,
    pendingNodeId,
  });

  // Mark the run as active again while we continue.
  await updateExecution(userDO, record.id, { status: 'running', pendingNodeId: '' });

  const result = await runEngine({
    c,
    bindingName,
    user,
    userDO,
    persisted,
    executionKey,
    decision: { nodeId: pendingNodeId, approved, note },
  });
  const persistedResult = await persistOrFailRun(
    userDO,
    record.id,
    persisted,
    result,
    executionKey,
    'resumeWorkflowExecution',
  );

  return {
    status: persistedResult.status === 'continuing' ? 'running' : persistedResult.status,
    executionKey,
    workflowId: persisted.meta.workflowId,
    workflowOwnerId: persisted.meta.ownerId,
    output: persistedResult.output,
    steps: persisted.engine.steps,
    totalCostVnd: persisted.engine.totalCostVnd,
    totalCreditsCharged: persisted.engine.totalCostVnd,
    totalCreditsRoyalty: persisted.engine.totalRoyaltyUsd ?? 0,
    totalRoyaltyUsd: persisted.engine.totalRoyaltyUsd ?? 0,
    pendingNodeId: persistedResult.pendingNodeId,
  };
}

/**
 * Mark a durable execution failed when the continue alarm/slice crashes
 * without a normal engine result (queue drop / DO kill / uncaught throw).
 */
export async function markWorkflowExecutionFailed(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  executionKey: string;
  error: string;
  runnerDoIdString?: string;
}): Promise<void> {
  const userDO = resolveRunnerDO(
    params.c,
    params.bindingName,
    params.user.identifier,
    params.runnerDoIdString,
  );
  const record = await getExecutionByKey(userDO, params.executionKey);
  if (!record) return;
  if (record.status !== 'running' && record.status !== 'pending_human') return;

  const message = String(params.error || 'Execution failed').slice(0, 2000);
  await updateExecution(userDO, record.id, {
    status: 'failed',
    error: message,
    finishedAt: Date.now(),
    pendingNodeId: '',
  });
  try {
    await broadcastWorkflowExecutionProgress(userDO, {
      workflowId: record.workflowId,
      executionKey: params.executionKey,
      type: 'finished',
      status: 'failed',
    });
  } catch {
    /* best-effort */
  }
}

/**
 * If the last step failed, the node was already dequeued and never visited —
 * put it back so Resume retries that node (Save-RAG then skips indexed tables).
 */
function requeueLastFailedStep(engine: PersistedState['engine']): void {
  const steps = engine.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.status !== 'error' || !step.nodeId) continue;
    const nodeId = step.nodeId;
    engine.visited = (engine.visited ?? []).filter((id) => id !== nodeId);
    engine.skipped = (engine.skipped ?? []).filter((id) => id !== nodeId);
    if (!engine.queue.includes(nodeId)) {
      engine.queue.unshift(nodeId);
    }
    // Drop the failed step so a successful retry does not keep a stale error row.
    engine.steps = steps.slice(0, i);
    return;
  }
}

/**
 * Older checkpoints may have clipped loop outputs to `items: []` while still
 * holding a valid loopStates cursor. Rebuild the current batch so Save RAG
 * can resume instead of throwing "no table item from upstream".
 */
function repairLoopOutputsForResume(engine: PersistedState['engine']): void {
  const states = engine.loopStates ?? {};
  for (const [loopId, state] of Object.entries(states)) {
    if (!state?.items?.length) continue;
    const existing = engine.outputs[loopId] ?? {};
    if (pipelineItems(existing).length > 0) continue;
    const result = executeLoopOverItems(
      { batchSize: state.batchSize, flowKind: 'loop_over_items' },
      state.connectionCtx ?? {},
      state,
      false,
    );
    engine.outputs[loopId] = {
      ...result.output,
      flowKind: 'loop_over_items',
      activeBranches: [...result.activeHandles],
    };
  }
}

/**
 * Resume a failed (or cancelled-with-checkpoint) run from the persisted engine
 * snapshot. Enqueues a durable continue slice so long Save-RAG loops do not
 * block the HTTP request.
 */
export async function continueFromCheckpointWorkflowExecution(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  executionKey: string;
}): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, executionKey } = params;
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;

  const record = await getExecutionByKey(userDO, executionKey);
  if (!record) throw new Error('Execution not found');

  if (record.status === 'running') {
    // Idempotent: already continuing (e.g. double-click Resume).
    return {
      status: 'running',
      executionKey,
      workflowId: record.workflowId,
      workflowOwnerId: record.workflowOwnerId,
      steps: [],
      totalCostVnd: record.totalCostVnd ?? 0,
      totalCreditsCharged: record.totalCreditsCharged ?? record.totalCostVnd ?? 0,
      totalCreditsRoyalty: record.totalCreditsRoyalty ?? record.totalRoyaltyUsd ?? 0,
      totalRoyaltyUsd: record.totalRoyaltyUsd ?? 0,
    };
  }

  if (record.status !== 'failed' && record.status !== 'cancelled') {
    throw new Error(`Execution cannot be resumed from checkpoint (status: ${record.status})`);
  }

  let rawState: unknown;
  try {
    rawState = JSON.parse(record.state || '{}') as unknown;
  } catch {
    rawState = {};
  }

  const persisted = await resolvePersistedForResume({
    c,
    bindingName,
    user,
    record,
    rawState,
    pendingNodeId: record.pendingNodeId || '',
    preferEntryNodesWhenEmpty: true,
  });

  if (!persisted.engine || typeof persisted.engine !== 'object') {
    throw new Error('Execution engine snapshot missing; cannot resume from checkpoint');
  }

  requeueLastFailedStep(persisted.engine);
  repairLoopOutputsForResume(persisted.engine);

  const hasWork =
    (persisted.engine.queue?.length ?? 0) > 0 ||
    Object.keys(persisted.engine.loopStates ?? {}).length > 0;
  if (!hasWork) {
    throw new Error('No remaining work in the checkpoint; start a new run instead');
  }

  await updateExecution(userDO, record.id, {
    status: 'running',
    error: '',
    finishedAt: 0,
    pendingNodeId: '',
    state: serializePersistedState(persisted as unknown as Record<string, unknown>),
  });

  await enqueueWorkflowContinue(userDO, {
    executionKey,
    bindingName,
    identifier: user.identifier,
  });

  await broadcastWorkflowExecutionProgress(userDO, {
    workflowId: record.workflowId,
    executionKey,
    type: 'started',
    status: 'running',
  });

  return {
    status: 'running',
    executionKey,
    workflowId: record.workflowId,
    workflowOwnerId: record.workflowOwnerId,
    steps: persisted.engine.steps ?? [],
    totalCostVnd: record.totalCostVnd ?? 0,
    totalCreditsCharged: record.totalCreditsCharged ?? record.totalCostVnd ?? 0,
    totalCreditsRoyalty: record.totalCreditsRoyalty ?? record.totalRoyaltyUsd ?? 0,
    totalRoyaltyUsd: record.totalRoyaltyUsd ?? 0,
  };
}

/**
 * Stop a running or paused execution. Marks the record cancelled immediately
 * (covers zombie runs whose worker already died). A still-live engine notices
 * the flag between nodes and exits without overwriting the status.
 */
export async function cancelWorkflowExecution(params: {
  c: any;
  bindingName: string;
  user: { identifier: string };
  executionKey: string;
}): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, executionKey } = params;
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;

  const record = await getExecutionByKey(userDO, executionKey);
  if (!record) throw new Error('Execution not found');

  if (record.status === 'cancelled') {
    return {
      status: 'cancelled',
      executionKey,
      workflowId: record.workflowId,
      workflowOwnerId: record.workflowOwnerId,
      steps: [],
      totalCostVnd: record.totalCostVnd ?? 0,
      totalCreditsCharged: record.totalCreditsCharged ?? record.totalCostVnd ?? 0,
      totalCreditsRoyalty: record.totalCreditsRoyalty ?? record.totalRoyaltyUsd ?? 0,
      totalRoyaltyUsd: record.totalRoyaltyUsd ?? 0,
    };
  }

  if (!isStoppableExecutionStatus(record.status)) {
    throw new Error(`Execution cannot be stopped (status: ${record.status})`);
  }

  await updateExecution(userDO, record.id, {
    status: 'cancelled',
    pendingNodeId: '',
    finishedAt: Date.now(),
  });
  await broadcastWorkflowExecutionProgress(userDO, {
    workflowId: record.workflowId,
    executionKey,
    type: 'finished',
    status: 'cancelled',
  });

  let steps: ExecutionStepLog[] = [];
  try {
    const parsed = JSON.parse(record.state || '{}') as PersistedState;
    if (Array.isArray(parsed.engine?.steps)) steps = parsed.engine.steps;
  } catch {
    /* keep empty steps */
  }

  return {
    status: 'cancelled',
    executionKey,
    workflowId: record.workflowId,
    workflowOwnerId: record.workflowOwnerId,
    output: { stopped: true },
    steps,
    totalCostVnd: record.totalCostVnd ?? 0,
    totalCreditsCharged: record.totalCreditsCharged ?? record.totalCostVnd ?? 0,
    totalCreditsRoyalty: record.totalCreditsRoyalty ?? record.totalRoyaltyUsd ?? 0,
    totalRoyaltyUsd: record.totalRoyaltyUsd ?? 0,
  };
}
