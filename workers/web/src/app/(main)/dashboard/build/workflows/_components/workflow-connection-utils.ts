import type { Connection, Edge } from "@xyflow/react";

export type WorkflowHandleId = "in" | "out" | "service" | "memory" | "tools";

const RESOURCE_HANDLES = new Set<WorkflowHandleId>(["service", "memory", "tools"]);

/** Data flow uses out→in; resource handles connect when names match. */
export function isValidWorkflowConnection(connection: Connection | Edge): boolean {
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;
  if (!sourceHandle || !targetHandle) return false;
  if (sourceHandle === "out" && targetHandle === "in") return true;
  if (sourceHandle === targetHandle && RESOURCE_HANDLES.has(sourceHandle as WorkflowHandleId)) {
    return true;
  }
  return false;
}

function handleMatchesId(
  handle: string | null | undefined,
  handleId: WorkflowHandleId,
  isFlowHandle: boolean,
): boolean {
  if (isFlowHandle) {
    return handle === handleId || handle == null || handle === "";
  }
  return handle === handleId;
}

export function edgeUsesHandle(
  edge: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null },
  nodeId: string,
  handleId: WorkflowHandleId,
  type: "source" | "target",
): boolean {
  const isFlowHandle = handleId === "in" || handleId === "out";
  if (type === "source") {
    return edge.source === nodeId && handleMatchesId(edge.sourceHandle, handleId, isFlowHandle);
  }
  return edge.target === nodeId && handleMatchesId(edge.targetHandle, handleId, isFlowHandle);
}
