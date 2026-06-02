import type { Edge, Node } from "@xyflow/react";

import { isResourceEdge } from "./workflow-connection-utils";
import { WORKFLOW_CONNECT_OFFSET_X } from "./workflow-placement-constants";
import { positionResourcesUnderAgent, resourceBlockHeight } from "./workflow-resource-layout";

const FLOW_GAP_Y = 140;
// Horizontal spacing between disconnected/independent flow components.
const COMPONENT_GAP_X = 220;
const FLOW_NODE_ESTIMATED_WIDTH = 260;
const ORIGIN = { x: 80, y: 80 };

const RESOURCE_NODE_TYPES = new Set(["service_node", "memory_node", "tool_node"]);
const STICKY_NOTE_TYPE = "sticky_note";

function isFlowEdge(edge: Edge): boolean {
  return edge.sourceHandle === "out" && edge.targetHandle === "in";
}

function isLayoutFlowNode(node: Node): boolean {
  return node.type !== STICKY_NOTE_TYPE && !RESOURCE_NODE_TYPES.has(node.type ?? "");
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
  if (roots.length === 0) return [nodes[0].id];
  const triggers = roots.filter((n) => n.type === "trigger");
  if (triggers.length > 0) return triggers.map((n) => n.id);
  return roots.map((n) => n.id);
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

function groupByLayer(nodeIds: string[], layer: Map<string, number>): Map<number, string[]> {
  const byLayer = new Map<number, string[]>();
  for (const id of nodeIds) {
    const l = layer.get(id) ?? 0;
    const ids = byLayer.get(l) ?? [];
    ids.push(id);
    byLayer.set(l, ids);
  }
  return byLayer;
}

function barycenter(nodeId: string, neighbors: Map<string, string[]>, indexInLayer: Map<string, number>): number {
  const adjacent = neighbors.get(nodeId) ?? [];
  const positions = adjacent.map((id) => indexInLayer.get(id)).filter((value): value is number => value != null);
  if (positions.length === 0) return indexInLayer.get(nodeId) ?? 0;
  return positions.reduce((sum, value) => sum + value, 0) / positions.length;
}

function orderLayersByBarycenter(
  byLayer: Map<number, string[]>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
): Map<number, string[]> {
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const indexInLayer = new Map<string, number>();

  for (const layer of sortedLayers) {
    const ids = [...(byLayer.get(layer) ?? [])].sort();
    ids.forEach((id, index) => indexInLayer.set(id, index));
    byLayer.set(layer, ids);
  }

  const tieBreak = (a: string, b: string) => a.localeCompare(b);

  for (let pass = 0; pass < 4; pass++) {
    for (const layer of sortedLayers) {
      if (layer === 0) continue;
      const ids = [...(byLayer.get(layer) ?? [])];
      ids.sort((a, b) => {
        const delta = barycenter(a, incoming, indexInLayer) - barycenter(b, incoming, indexInLayer);
        return delta !== 0 ? delta : tieBreak(a, b);
      });
      byLayer.set(layer, ids);
      ids.forEach((id, index) => indexInLayer.set(id, index));
    }

    for (let i = sortedLayers.length - 2; i >= 0; i--) {
      const layer = sortedLayers[i];
      const ids = [...(byLayer.get(layer) ?? [])];
      ids.sort((a, b) => {
        const delta = barycenter(a, outgoing, indexInLayer) - barycenter(b, outgoing, indexInLayer);
        return delta !== 0 ? delta : tieBreak(a, b);
      });
      byLayer.set(layer, ids);
      ids.forEach((id, index) => indexInLayer.set(id, index));
    }
  }

  return byLayer;
}

function slotHeight(node: Node, resourceCountByAgent: Map<string, number>): number {
  if (node.type === "agent") {
    const resourceCount = resourceCountByAgent.get(node.id) ?? 0;
    return resourceCount > 0 ? resourceBlockHeight(resourceCount) : 220;
  }
  return FLOW_GAP_Y;
}

function positionFlowComponent(
  nodes: Node[],
  byLayer: Map<number, string[]>,
  resourceCountByAgent: Map<string, number>,
  offsetX: number,
): { positioned: Node[]; width: number; height: number } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  let maxWidth = 0;
  let maxHeight = ORIGIN.y;

  const positioned = sortedLayers.flatMap((layer) => {
    const ids = byLayer.get(layer) ?? [];
    let y = ORIGIN.y;
    maxWidth = Math.max(maxWidth, ORIGIN.x + offsetX + layer * WORKFLOW_CONNECT_OFFSET_X + FLOW_NODE_ESTIMATED_WIDTH);

    return ids.map((id) => {
      const node = nodeMap.get(id);
      if (!node) return null;

      const position = {
        x: Math.round(ORIGIN.x + offsetX + layer * WORKFLOW_CONNECT_OFFSET_X),
        y: Math.round(y),
      };
      y += slotHeight(node, resourceCountByAgent);
      maxHeight = Math.max(maxHeight, y);
      return { ...node, position };
    });
  });

  return {
    positioned: positioned.filter((node): node is Node => node != null),
    width: maxWidth - ORIGIN.x - offsetX,
    height: maxHeight - ORIGIN.y,
  };
}

function visitFlowComponent(startId: string, adjacency: Map<string, Set<string>>, visited: Set<string>): string[] {
  const component: string[] = [];
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null || visited.has(current)) continue;
    visited.add(current);
    component.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
  return component;
}

function findFlowComponents(nodeIds: Set<string>, flowEdges: Edge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const edge of flowEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    components.push(visitFlowComponent(id, adjacency, visited));
  }
  return components;
}

function layoutFlowNodes(flowNodes: Node[], flowEdges: Edge[], resourceCountByAgent: Map<string, number>): Node[] {
  if (flowNodes.length === 0) return [];

  const nodeIds = new Set(flowNodes.map((n) => n.id));
  const componentIds = findFlowComponents(nodeIds, flowEdges);
  const nodeMap = new Map(flowNodes.map((n) => [n.id, n]));

  const connectedComponents = componentIds.filter((ids) => {
    if (ids.length > 1) return true;
    const id = ids[0];
    return flowEdges.some((edge) => edge.source === id || edge.target === id);
  });
  const isolatedIds = componentIds
    .filter((ids) => ids.length === 1 && !flowEdges.some((edge) => edge.source === ids[0] || edge.target === ids[0]))
    .flat();

  let offsetX = 0;
  const positioned: Node[] = [];

  for (const ids of connectedComponents) {
    const componentNodes = ids.map((id) => nodeMap.get(id)).filter((node): node is Node => node != null);
    const componentIdSet = new Set(ids);
    const componentEdges = flowEdges.filter(
      (edge) => componentIdSet.has(edge.source) && componentIdSet.has(edge.target),
    );
    const { incoming, outgoing } = buildFlowAdjacency(componentIdSet, componentEdges);
    const layer = assignLayers(findStartNodeIds(componentNodes, incoming), outgoing);
    for (const id of ids) {
      if (!layer.has(id)) layer.set(id, 0);
    }
    const byLayer = orderLayersByBarycenter(groupByLayer(ids, layer), incoming, outgoing);
    const result = positionFlowComponent(componentNodes, byLayer, resourceCountByAgent, offsetX);
    positioned.push(...result.positioned);
    offsetX += result.width + COMPONENT_GAP_X;
  }

  if (isolatedIds.length > 0) {
    let y = ORIGIN.y;
    for (const id of isolatedIds.sort()) {
      const node = nodeMap.get(id);
      if (!node) continue;
      positioned.push({
        ...node,
        position: { x: Math.round(ORIGIN.x + offsetX), y: Math.round(y) },
      });
      y += slotHeight(node, resourceCountByAgent);
    }
  }

  return positioned;
}

function layoutResourceNodes(resourceNodes: Node[], edges: Edge[], positionedById: Map<string, Node>): Node[] {
  const byAgent = new Map<string, Node[]>();
  const orphans: Node[] = [];

  for (const node of resourceNodes) {
    const edge = edges.find((candidate) => candidate.source === node.id && isResourceEdge(candidate));
    const agentId = edge?.target;
    if (agentId && positionedById.has(agentId)) {
      const bucket = byAgent.get(agentId) ?? [];
      bucket.push(node);
      byAgent.set(agentId, bucket);
    } else {
      orphans.push(node);
    }
  }

  const positioned = [...byAgent.entries()].flatMap(([agentId, resources]) => {
    const agent = positionedById.get(agentId);
    if (!agent) return [];
    return positionResourcesUnderAgent(agent, resources);
  });

  let orphanY = ORIGIN.y;
  for (const node of orphans.sort((a, b) => a.id.localeCompare(b.id))) {
    positioned.push({
      ...node,
      position: { x: Math.round(ORIGIN.x), y: Math.round(orphanY) },
    });
    orphanY += FLOW_GAP_Y;
  }

  return positioned;
}

function buildResourceCountByAgent(edges: Edge[], flowNodeIds: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    if (!isResourceEdge(edge)) continue;
    if (!flowNodeIds.has(edge.target)) continue;
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  return counts;
}

/** Auto-layout flow nodes left-to-right; resource nodes under agents; sticky notes unchanged. */
export function layoutWorkflowNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const stickyNotes = nodes.filter((node) => node.type === STICKY_NOTE_TYPE);
  const resourceNodes = nodes.filter((node) => RESOURCE_NODE_TYPES.has(node.type ?? ""));
  const flowNodes = nodes.filter(isLayoutFlowNode);

  const flowNodeIds = new Set(flowNodes.map((node) => node.id));
  const flowEdges = edges.filter(isFlowEdge).filter((edge) => {
    return flowNodeIds.has(edge.source) && flowNodeIds.has(edge.target);
  });

  const resourceCountByAgent = buildResourceCountByAgent(edges, flowNodeIds);

  const positionedFlow = layoutFlowNodes(flowNodes, flowEdges, resourceCountByAgent);
  const positionedById = new Map(positionedFlow.map((node) => [node.id, node]));
  const positionedResources = layoutResourceNodes(resourceNodes, edges, positionedById);

  return [...positionedFlow, ...positionedResources, ...stickyNotes];
}
