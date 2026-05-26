import type { Connection, Edge } from "@xyflow/react";

import { isResourceEdge } from "./workflow-connection-utils";

/** SVG marker id (see WorkflowEdgeMarkers) */
export const WORKFLOW_EDGE_MARKER_ID = "workflow-arrow-closed";

/** Custom SVG marker — scales with stroke width & canvas zoom (see WorkflowEdgeMarkers) */
export const WORKFLOW_EDGE_MARKER_END = `url(#${WORKFLOW_EDGE_MARKER_ID})`;

/** Edge stroke; marker size is a multiple of this (markerUnits=strokeWidth). */
export const WORKFLOW_EDGE_STROKE_WIDTH = 2;

/** Marker viewport in stroke-width units (~12px at default zoom when stroke is 2). */
export const WORKFLOW_EDGE_MARKER_SIZE = 6;

export const WORKFLOW_EDGE_STYLE = {
  strokeWidth: WORKFLOW_EDGE_STROKE_WIDTH,
  stroke: "var(--xy-edge-stroke-default, var(--border))",
};

export function normalizeWorkflowEdge(edge: Edge | Connection): Edge {
  const e = edge as Edge;
  const resource = isResourceEdge(edge);
  const dash = e.style?.strokeDasharray ?? (resource ? "6 4" : undefined);
  return {
    ...e,
    id: e.id ?? `${edge.source}-${edge.sourceHandle ?? "s"}-${edge.target}-${edge.targetHandle ?? "t"}`,
    type: e.type ?? "workflowDeletable",
    animated: e.animated ?? true,
    markerEnd: WORKFLOW_EDGE_MARKER_END,
    style: {
      ...WORKFLOW_EDGE_STYLE,
      ...(dash ? { strokeDasharray: dash } : {}),
      ...e.style,
    },
  };
}
