import type { WorkflowDefinition } from '../domain/domain.js';
import {
  getIncomingDataFlowEdges,
  isMergeFlowNode,
  isNonExecutableNode,
  mergeMode,
} from './graph-helpers.js';

type EngineSnapshot = {
  visited: string[];
  skipped: string[];
  outputs: Record<string, unknown>;
};

function isHumanReviewNode(
  node: WorkflowDefinition['nodes'][number] | undefined,
): boolean {
  return node?.type === 'human_review';
}

function mergeWaitingOnParents(
  node: WorkflowDefinition['nodes'][number],
  definition: WorkflowDefinition,
  engine: EngineSnapshot,
): boolean {
  if (!isMergeFlowNode(node) || mergeMode(node) !== 'wait_all') return false;
  const parents = getIncomingDataFlowEdges(definition, node.id).map((e) => e.source);
  if (!parents.length) return false;
  return parents.some(
    (parentId) => engine.outputs[parentId] === undefined && !engine.skipped.includes(parentId),
  );
}

/**
 * True when the queue still has work that can run without this human_review node.
 * Send-and-wait should finish that sibling work (e.g. Save RAG) before pausing.
 */
export function hasRunnableSiblingWork(args: {
  queue: string[];
  definition: WorkflowDefinition;
  nodeById: Map<string, WorkflowDefinition['nodes'][number]>;
  engine: EngineSnapshot;
  exceptNodeId: string;
}): boolean {
  const { queue, definition, nodeById, engine, exceptNodeId } = args;
  for (const id of queue) {
    if (id === exceptNodeId) continue;
    if (engine.visited.includes(id) || engine.skipped.includes(id)) continue;
    const node = nodeById.get(id);
    if (!node || isNonExecutableNode(node, definition)) continue;
    if (isHumanReviewNode(node)) continue;
    if (mergeWaitingOnParents(node, definition, engine)) continue;
    return true;
  }
  return false;
}

/** Drop leftover sibling nodes so a pause only keeps other human_review waits. */
export function queueAfterHumanReviewPause(
  queue: string[],
  nodeById: Map<string, WorkflowDefinition['nodes'][number]>,
): string[] {
  return queue.filter((id) => isHumanReviewNode(nodeById.get(id)));
}

/**
 * Resume starts at the approved human_review node, then only its downstream.
 * Leftover siblings (Get DB Info / Save RAG) must not run after Approve.
 */
export function queueAfterHumanReviewResume(
  queue: string[],
  pendingNodeId: string,
  nodeById: Map<string, WorkflowDefinition['nodes'][number]>,
): string[] {
  const otherReviews = queue.filter(
    (id) => id !== pendingNodeId && isHumanReviewNode(nodeById.get(id)),
  );
  return [pendingNodeId, ...otherReviews];
}
