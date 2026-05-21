"use client";

import { WORKFLOW_EDGE_MARKER_ID } from "./workflow-edge-utils";

/** Arrow marker defs for workflow edges (referenced via url(#workflow-arrow-closed)). */
export function WorkflowEdgeMarkers() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <marker
          id={WORKFLOW_EDGE_MARKER_ID}
          viewBox="-10 -5 20 10"
          refX={0}
          refY={0}
          markerWidth={12}
          markerHeight={12}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M -10 -5 L 0 0 L -10 5 Z" className="fill-foreground" />
        </marker>
      </defs>
    </svg>
  );
}
