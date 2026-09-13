import type { Edge, Node } from "@xyflow/react";

import { isDataFlowEdge } from "../edges/workflow-connection-utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pinnedOutput(node: Node | undefined): Record<string, unknown> | null {
  const output = asRecord((node?.data as Record<string, unknown> | undefined)?._output);
  if (!output) return null;
  const keys = Object.keys(output).filter((key) => key !== "parents");
  return keys.length ? output : null;
}

export function hasPinnedOutput(node: Node | undefined): boolean {
  return pinnedOutput(node) != null;
}

function incomingSources(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((edge) => edge.target === nodeId && isDataFlowEdge(edge)).map((edge) => edge.source);
}

/** Data-flow ancestors, farthest first so closer pinned outputs win on overlap. */
export function dataFlowAncestorsFarthestFirst(nodeId: string, edges: Edge[]): string[] {
  const distance = new Map<string, number>();
  const queue: Array<{ id: string; distance: number }> = [{ id: nodeId, distance: 0 }];
  distance.set(nodeId, 0);

  while (queue.length) {
    const current = queue.shift()!;
    for (const parentId of incomingSources(current.id, edges)) {
      if (distance.has(parentId)) continue;
      distance.set(parentId, current.distance + 1);
      queue.push({ id: parentId, distance: current.distance + 1 });
    }
  }

  return [...distance.entries()]
    .filter(([id]) => id !== nodeId)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/** Merge every pinned ancestor `_output` (all branches), skipping empty/unrun nodes. */
export function mergePinnedAncestorOutputs(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Record<string, unknown> {
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));
  const merged: Record<string, unknown> = {};
  for (const ancestorId of dataFlowAncestorsFarthestFirst(nodeId, edges)) {
    const output = pinnedOutput(nodeById.get(ancestorId));
    if (!output) continue;
    const copy = { ...output };
    delete copy.parents;
    Object.assign(merged, copy);
  }
  return merged;
}

/** JSON payload for Execute step — same merge idea as runtime, using canvas pins. */
export function upstreamExecuteInput(nodeId: string, nodes: Node[], edges: Edge[]): string | undefined {
  const merged = mergePinnedAncestorOutputs(nodeId, nodes, edges);
  if (!Object.keys(merged).length) return undefined;
  try {
    return JSON.stringify(merged);
  } catch {
    return undefined;
  }
}
