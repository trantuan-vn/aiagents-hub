/** Shared placement offsets for workflow canvas nodes (create + tidy layout). */

// Horizontal spacing between consecutive flow columns.
export const WORKFLOW_CONNECT_OFFSET_X = 340;

// Approximate rendered width of a workflow node shell (min-w-[200px] + padding).
export const WORKFLOW_NODE_WIDTH = 220;
export const WORKFLOW_RESOURCE_GAP = 32;
export const WORKFLOW_RESOURCE_NODE_SPACING_X = WORKFLOW_NODE_WIDTH + WORKFLOW_RESOURCE_GAP;

// Horizontal center of agent node (min-width 200px).
export const WORKFLOW_AGENT_ANCHOR_X = 100;

// Vertical offset from agent top to first resource row.
export const WORKFLOW_RESOURCE_OFFSET_Y = 168;
export const WORKFLOW_RESOURCE_ROW_GAP_Y = 96;
export const WORKFLOW_RESOURCES_MAX_PER_ROW = 4;

/** @deprecated Use row layout via workflow-resource-layout instead. Kept for reference. */
export const WORKFLOW_RESOURCE_HANDLE_OFFSET_X: Record<string, number> = {
  service: -110,
  memory: 0,
  tools: 110,
};
