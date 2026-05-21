import { MarkerType, type Edge } from "@xyflow/react";

/** SVG marker id (see WorkflowEdgeMarkers) */
export const WORKFLOW_EDGE_MARKER_ID = "workflow-arrow-closed";

/** For BaseEdge / SVG path — must be a string URL */
export const WORKFLOW_EDGE_MARKER_END_URL = `url(#${WORKFLOW_EDGE_MARKER_ID})`;

/** For Edge state & defaultEdgeOptions — React Flow resolves to marker URL when rendering */
export const WORKFLOW_EDGE_MARKER_END = {
  type: MarkerType.ArrowClosed,
  width: 20,
  height: 20,
};

export const WORKFLOW_EDGE_STYLE = {
  strokeWidth: 2,
};

export function normalizeWorkflowEdge(edge: Edge): Edge {
  return {
    ...edge,
    type: edge.type ?? "workflowDeletable",
    animated: edge.animated ?? true,
    markerEnd: edge.markerEnd ?? WORKFLOW_EDGE_MARKER_END,
    style: { ...WORKFLOW_EDGE_STYLE, ...edge.style },
  };
}
