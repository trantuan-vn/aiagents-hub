"use client";

import { WORKFLOW_EDGE_MARKER_ID, WORKFLOW_EDGE_MARKER_SIZE } from "./workflow-edge-utils";

/** Arrow marker defs for workflow edges (referenced via url(#workflow-arrow-closed)). */
export function WorkflowEdgeMarkers() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <marker
          id={WORKFLOW_EDGE_MARKER_ID}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={WORKFLOW_EDGE_MARKER_SIZE}
          markerHeight={WORKFLOW_EDGE_MARKER_SIZE}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 1.5 2 L 8 5 L 1.5 8 Z" fill="var(--muted-foreground)" />
        </marker>
      </defs>
    </svg>
  );
}
