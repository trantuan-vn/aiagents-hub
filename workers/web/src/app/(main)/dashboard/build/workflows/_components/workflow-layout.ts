import type { Edge, Node } from "@xyflow/react";

const FLOW_GAP_X = 300;
const FLOW_GAP_Y = 140;
const ORIGIN = { x: 80, y: 80 };

function isFlowEdge(edge: Edge): boolean {
  return edge.sourceHandle === "out" && edge.targetHandle === "in";
}

function buildFlowAdjacency(
  nodeIds: Set<string>,
  flowEdges: Edge[],
): { incoming: Map<string, string[]>; outgoing: Map<string, string[]> } {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of flowEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }
  return { incoming, outgoing };
}

function findStartNodeIds(nodes: Node[], incoming: Map<string, string[]>): string[] {
  const roots = nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);
  if (roots.length > 0) return roots.map((n) => n.id);
  return [nodes[0].id];
}

function assignLayers(startIds: string[], outgoing: Map<string, string[]>): Map<string, number> {
  const layer = new Map<string, number>();
  const queue = [...startIds];
  for (const id of startIds) layer.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift();
    if (id == null) continue;
    const currentLayer = layer.get(id) ?? 0;
    for (const nextId of outgoing.get(id) ?? []) {
      const nextLayer = currentLayer + 1;
      const existing = layer.get(nextId);
      if (existing == null || nextLayer > existing) {
        layer.set(nextId, nextLayer);
        queue.push(nextId);
      }
    }
  }
  return layer;
}

function ensureAllNodesLayered(nodes: Node[], layer: Map<string, number>): void {
  for (const node of nodes) {
    if (!layer.has(node.id)) layer.set(node.id, 0);
  }
}

function groupByLayer(nodes: Node[], layer: Map<string, number>): Map<number, string[]> {
  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layer.get(node.id) ?? 0;
    const ids = byLayer.get(l) ?? [];
    ids.push(node.id);
    byLayer.set(l, ids);
  }
  return byLayer;
}

function positionNodes(nodes: Node[], byLayer: Map<number, string[]>): Node[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);

  return sortedLayers
    .flatMap((l) => {
      const ids = [...(byLayer.get(l) ?? [])].sort();
      return ids.map((id, index) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        return {
          ...node,
          position: {
            x: ORIGIN.x + l * FLOW_GAP_X,
            y: ORIGIN.y + index * FLOW_GAP_Y,
          },
        };
      });
    })
    .filter((n): n is Node => n != null);
}

/** Auto-layout nodes left-to-right along main flow edges (out → in). */
export function layoutWorkflowNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const flowEdges = edges.filter(isFlowEdge);
  const { incoming, outgoing } = buildFlowAdjacency(nodeIds, flowEdges);

  const layer = assignLayers(findStartNodeIds(nodes, incoming), outgoing);
  ensureAllNodesLayered(nodes, layer);

  return positionNodes(nodes, groupByLayer(nodes, layer));
}
