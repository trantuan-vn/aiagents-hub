import type { Edge } from "@xyflow/react";

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

export function normalizeWorkflowEdge(edge: Edge): Edge {
  return {
    ...edge,
    type: edge.type ?? "workflowDeletable",
    animated: edge.animated ?? true,
    markerEnd: WORKFLOW_EDGE_MARKER_END,
    style: { ...WORKFLOW_EDGE_STYLE, ...edge.style },
  };
}
