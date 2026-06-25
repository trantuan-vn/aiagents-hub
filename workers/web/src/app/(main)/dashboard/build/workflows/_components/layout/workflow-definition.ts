import type { Edge, Node } from "@xyflow/react";

import { hasRouteAdjustments, readEdgeRouteAdjustments } from "../edges/workflow-edge-route-data";

export interface WorkflowDefinition {
  nodes: Node[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}

/** Strip React Flow runtime fields so parent JSON stays stable across emit cycles. */
export function toPersistedDefinition(
  nodes: Node[],
  edges: Edge[],
  viewport?: WorkflowDefinition["viewport"],
): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => {
      const base: Node = {
        id: n.id,
        type: n.type,
        position: {
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        },
        data: n.data,
      };
      if (n.parentId) base.parentId = n.parentId;
      if (n.extent) base.extent = n.extent;
      if (n.style && Object.keys(n.style).length > 0) base.style = n.style;
      if (n.zIndex != null) base.zIndex = n.zIndex;
      return base;
    }),
    edges: edges.map((e) => {
      const base = {
        id: e.id,
        type: e.type ?? "workflowDeletable",
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      };
      const routeAdjustments = readEdgeRouteAdjustments(e.data);
      if (hasRouteAdjustments(routeAdjustments)) {
        return { ...base, data: { routeAdjustments } };
      }
      return base;
    }),
    viewport,
  };
}

export function persistedSignature(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify(toPersistedDefinition(nodes, edges));
}
