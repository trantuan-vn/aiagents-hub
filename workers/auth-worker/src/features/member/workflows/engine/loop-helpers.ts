import type { WorkflowDefinition } from '../domain/domain.js';
import { getOutgoingDataFlowEdges } from './graph-helpers.js';

export interface LoopState {
  items: unknown[];
  batchSize: number;
  currentBatchIndex: number;
  totalBatches: number;
  iterationOutputs: Record<string, unknown>[];
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

/** Extract iterable items from upstream node output (n8n item-list shape). */
export function extractLoopItems(input: NodeOutput): unknown[] {
  if (Array.isArray(input.items)) return input.items;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.json)) return input.json;

  const { parents, ...rest } = input;
  if (Array.isArray(rest)) return rest;
  if (Object.keys(rest).length > 0) return [rest];
  return [];
}

export function executeLoopOverItems(
  data: Record<string, unknown>,
  nodeInput: NodeOutput,
  existingState: LoopState | undefined,
  isReturn: boolean,
  returnOutput?: NodeOutput,
): LoopExecutionResult {
  const batchSize = Math.max(1, Number(data.batchSize ?? 1) || 1);

  let state = existingState;
  if (!state) {
    const items = extractLoopItems(nodeInput);
    const batches = chunkArray(items, batchSize);
    state = {
      items,
      batchSize,
      currentBatchIndex: 0,
      totalBatches: batches.length,
      iterationOutputs: [],
    };
  }

  if (isReturn && returnOutput) {
    state.iterationOutputs.push(returnOutput);
    state.currentBatchIndex++;
  }

  if (state.totalBatches === 0 || state.currentBatchIndex >= state.totalBatches) {
    return {
      output: {
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

  return {
    output: {
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
