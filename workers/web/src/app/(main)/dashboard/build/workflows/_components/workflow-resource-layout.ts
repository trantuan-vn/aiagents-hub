import type { Node } from "@xyflow/react";

import {
  WORKFLOW_AGENT_ANCHOR_X,
  WORKFLOW_RESOURCE_GAP,
  WORKFLOW_RESOURCE_OFFSET_Y,
  WORKFLOW_RESOURCE_ROW_GAP_Y,
  WORKFLOW_RESOURCES_MAX_PER_ROW,
  WORKFLOW_RESOURCE_NODE_SPACING_X,
} from "./workflow-placement-constants";

const RESOURCE_TYPE_ORDER: Record<string, number> = {
  service_node: 0,
  memory_node: 1,
  tool_node: 2,
};

/** Sort resources: service → memory → tools (stable by id within each type). */
export function sortResourceNodes(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    const orderA = RESOURCE_TYPE_ORDER[a.type ?? ""] ?? 9;
    const orderB = RESOURCE_TYPE_ORDER[b.type ?? ""] ?? 9;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export function countResourceRows(resourceCount: number): number {
  if (resourceCount <= 0) return 0;
  return Math.ceil(resourceCount / WORKFLOW_RESOURCES_MAX_PER_ROW);
}

/** Vertical space an agent row must reserve for attached resources. */
export function resourceBlockHeight(resourceCount: number): number {
  const rows = countResourceRows(resourceCount);
  if (rows === 0) return 0;
  const resourceNodeHeight = 72;
  return (
    WORKFLOW_RESOURCE_OFFSET_Y + rows * resourceNodeHeight + Math.max(0, rows - 1) * WORKFLOW_RESOURCE_ROW_GAP_Y + 40
  );
}

/** Place resource nodes in centered row(s) under an agent. */
export function positionResourcesUnderAgent(agent: Node, resources: Node[]): Node[] {
  if (resources.length === 0) return [];

  const sorted = sortResourceNodes(resources);
  const agentCenterX = agent.position.x + WORKFLOW_AGENT_ANCHOR_X;

  return sorted.map((node, index) => {
    const row = Math.floor(index / WORKFLOW_RESOURCES_MAX_PER_ROW);
    const col = index % WORKFLOW_RESOURCES_MAX_PER_ROW;
    const nodesInRow = Math.min(WORKFLOW_RESOURCES_MAX_PER_ROW, sorted.length - row * WORKFLOW_RESOURCES_MAX_PER_ROW);
    const rowWidth = nodesInRow * WORKFLOW_RESOURCE_NODE_SPACING_X - WORKFLOW_RESOURCE_GAP;
    const rowStartX = agentCenterX - rowWidth / 2;

    return {
      ...node,
      position: {
        x: Math.round(rowStartX + col * WORKFLOW_RESOURCE_NODE_SPACING_X),
        y: Math.round(agent.position.y + WORKFLOW_RESOURCE_OFFSET_Y + row * WORKFLOW_RESOURCE_ROW_GAP_Y),
      },
    };
  });
}

/** Position for a newly added resource node (includes existing siblings). */
export function computeNewResourceNodePosition(
  agent: Node,
  existingResources: Node[],
  newNode: Node,
): { x: number; y: number } {
  const positioned = positionResourcesUnderAgent(agent, [...existingResources, newNode]);
  const placed = positioned.find((node) => node.id === newNode.id);
  return (
    placed?.position ?? {
      x: Math.round(agent.position.x),
      y: Math.round(agent.position.y + WORKFLOW_RESOURCE_OFFSET_Y),
    }
  );
}
