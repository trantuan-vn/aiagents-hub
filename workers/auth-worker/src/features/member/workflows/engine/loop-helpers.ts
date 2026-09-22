import type { WorkflowDefinition } from '../domain/domain.js';
import { interpolate } from '../execution/node-runtime.js';
import { getOutgoingDataFlowEdges } from './graph-helpers.js';

export interface LoopState {
  items: unknown[];
  batchSize: number;
  currentBatchIndex: number;
  totalBatches: number;
  iterationOutputs: Record<string, unknown>[];
  /** Oracle/D1 credentials from Get DB Info — kept across loop iterations. */
  connectionCtx?: Record<string, unknown>;
}

export interface LoopExecutionResult {
  output: Record<string, unknown>;
  activeHandles: Set<string>;
  loopState: LoopState | null;
}

type NodeOutput = Record<string, unknown>;

export function isLoopOverItemsNode(node: { type: string; data?: Record<string, unknown> }): boolean {
  if (node.type !== 'flow') return false;
  return String((node.data ?? {}).flowKind ?? '') === 'loop_over_items';
}

export function chunkArray<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, batchSize);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Extract iterable items from the mapped itemsField expression only. */
export function extractLoopItems(input: NodeOutput, itemsField?: unknown): unknown[] {
  const expr = String(itemsField ?? '').trim();
  if (!expr) return [];
  const resolved = expr.includes('{{')
    ? interpolate(expr, { ...input, $json: input })
    : input[expr];
  return Array.isArray(resolved) ? resolved : [];
}

function flattenCurrentItem(batch: unknown[]): Record<string, unknown> {
  const first = batch[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return first as Record<string, unknown>;
  }
  if (first !== undefined) return { json: first };
  return {};
}

/** Keys that must not be copied onto every loop batch (lists bloat checkpoints). */
const LOOP_CONTEXT_OMIT = new Set([
  'items',
  'parents',
  'tables',
  'count',
  'tableCount',
  'iterationOutputs',
  'batchIndex',
  'batchSize',
  'totalBatches',
  'loopCompleted',
  'flowKind',
  'activeBranches',
  '_loopState',
]);

/** Forward credentials / schema from the previous node onto each loop batch. */
export function connectionContextFromInput(input: NodeOutput): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (LOOP_CONTEXT_OMIT.has(key)) continue;
    rest[key] = value;
  }
  return rest;
}

/** Keep loop return payloads tiny — full Save RAG docs must not accumulate in loopStates. */
export function slimIterationOutput(output: NodeOutput): Record<string, unknown> {
  const tables = Array.isArray(output.tables)
    ? output.tables.map((t) => String(t)).filter(Boolean).slice(0, 50)
    : undefined;
  const documentIds = Array.isArray(output.documentIds)
    ? output.documentIds.map((id) => String(id)).filter(Boolean).slice(0, 20)
    : undefined;
  const slim: Record<string, unknown> = {};
  if (output.ok != null) slim.ok = output.ok;
  if (output.saved != null) slim.saved = output.saved;
  if (output.skipped != null) slim.skipped = output.skipped;
  if (output.error != null) slim.error = String(output.error).slice(0, 500);
  if (output.tableName != null) slim.tableName = String(output.tableName);
  if (tables?.length) slim.tables = tables;
  if (documentIds?.length) slim.documentIds = documentIds;
  if (output.collection != null) slim.collection = String(output.collection);
  return slim;
}

export function executeLoopOverItems(
  data: Record<string, unknown>,
  nodeInput: NodeOutput,
  existingState: LoopState | undefined,
  isReturn: boolean,
  returnOutput?: NodeOutput,
): LoopExecutionResult {
  const batchSize = Math.max(1, Number(data.batchSize ?? 1) || 1);
  const incomingConnection = connectionContextFromInput(nodeInput);

  let state = existingState;
  if (!state) {
    const items = extractLoopItems(nodeInput, data.itemsField);
    const batches = chunkArray(items, batchSize);
    state = {
      items,
      batchSize,
      currentBatchIndex: 0,
      totalBatches: batches.length,
      iterationOutputs: [],
      connectionCtx: incomingConnection,
    };
  } else if (!state.connectionCtx || !Object.keys(state.connectionCtx).length) {
    state.connectionCtx = incomingConnection;
  }

  const connectionCtx = state.connectionCtx ?? incomingConnection;

  if (isReturn && returnOutput) {
    state.iterationOutputs.push(slimIterationOutput(returnOutput));
    state.currentBatchIndex++;
  }

  if (state.totalBatches === 0 || state.currentBatchIndex >= state.totalBatches) {
    return {
      output: {
        ...connectionCtx,
        items: state.items,
        iterationOutputs: state.iterationOutputs,
        loopCompleted: true,
        totalBatches: state.totalBatches,
        batchSize: state.batchSize,
      },
      activeHandles: new Set(['done']),
      loopState: null,
    };
  }

  const batches = chunkArray(state.items, state.batchSize);
  const batch = batches[state.currentBatchIndex] ?? [];
  const currentItem = flattenCurrentItem(batch);

  return {
    output: {
      ...connectionCtx,
      ...currentItem,
      items: batch,
      batchIndex: state.currentBatchIndex,
      batchSize: state.batchSize,
      totalBatches: state.totalBatches,
      loopCompleted: false,
    },
    activeHandles: new Set(['loop']),
    loopState: state,
  };
}

/** Nodes on the loop branch (from `loop` handle back toward the loop node, excluding the loop node). */
export function getLoopSubgraphNodeIds(
  definition: WorkflowDefinition,
  loopNodeId: string,
): Set<string> {
  const result = new Set<string>();
  const loopEdges = getOutgoingDataFlowEdges(definition, loopNodeId).filter(
    (e) => (e.sourceHandle ?? 'out') === 'loop',
  );

  const queue = loopEdges.map((e) => e.target);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === loopNodeId) continue;
    if (result.has(id)) continue;
    result.add(id);

    for (const edge of getOutgoingDataFlowEdges(definition, id)) {
      if (edge.target === loopNodeId) continue;
      queue.push(edge.target);
    }
  }

  return result;
}

export function resetLoopSubgraphVisited(
  definition: WorkflowDefinition,
  loopNodeId: string,
  visited: string[],
): string[] {
  const subgraph = getLoopSubgraphNodeIds(definition, loopNodeId);
  return visited.filter((id) => id !== loopNodeId && !subgraph.has(id));
}
