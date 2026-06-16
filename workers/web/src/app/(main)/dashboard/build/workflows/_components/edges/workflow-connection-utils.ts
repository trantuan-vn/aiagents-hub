import type { Connection, Edge, Node } from "@xyflow/react";

export type WorkflowHandleId =
  | "in"
  | "out"
  | "service"
  | "memory"
  | "tools"
  | "true"
  | "false"
  | "default"
  | `case_${number}`;

const RESOURCE_HANDLES = new Set<WorkflowHandleId>(["service", "memory", "tools"]);

const BRANCH_SOURCE_HANDLES = new Set<string>(["out", "true", "false", "default"]);

function isBranchSourceHandle(handle: string): boolean {
  if (BRANCH_SOURCE_HANDLES.has(handle)) return true;
  return /^case_\d+$/.test(handle);
}

const SINGLE_CONNECTION_HANDLES = new Set<WorkflowHandleId>(["service", "memory"]);

/** Node type → resource handle it may connect through. */
export const RESOURCE_NODE_HANDLE: Record<string, WorkflowHandleId> = {
  service_node: "service",
  memory_node: "memory",
  tool_node: "tools",
};

export function isResourceEdge(edge: Pick<Edge, "sourceHandle" | "targetHandle">): boolean {
  const handle = edge.sourceHandle ?? edge.targetHandle;
  return handle != null && RESOURCE_HANDLES.has(handle as WorkflowHandleId);
}

function nodeTypeForId(nodes: Node[], nodeId: string): string | undefined {
  return nodes.find((n) => n.id === nodeId)?.type;
}

function resourceHandleForNodeType(nodeType: string | undefined): WorkflowHandleId | null {
  if (!nodeType) return null;
  return RESOURCE_NODE_HANDLE[nodeType] ?? null;
}

function edgeId(connection: Connection | Edge): string | undefined {
  return "id" in connection ? connection.id : undefined;
}

function countAgentHandleConnections(
  edges: Edge[],
  agentId: string,
  handleId: WorkflowHandleId,
  excludeEdgeId?: string,
): number {
  return edges.filter(
    (e) =>
      e.id !== excludeEdgeId &&
      e.target === agentId &&
      e.targetHandle === handleId &&
      RESOURCE_HANDLES.has(handleId),
  ).length;
}

function countResourceNodeConnections(
  edges: Edge[],
  resourceNodeId: string,
  handleId: WorkflowHandleId,
  excludeEdgeId?: string,
): number {
  return edges.filter(
    (e) =>
      e.id !== excludeEdgeId &&
      e.source === resourceNodeId &&
      e.sourceHandle === handleId &&
      RESOURCE_HANDLES.has(handleId),
  ).length;
}

type ParsedWorkflowHandles = { kind: "flow" } | { kind: "resource"; handle: WorkflowHandleId };

function parseWorkflowConnectionHandles(
  connection: Connection | Edge,
): ParsedWorkflowHandles | null {
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;
  if (!sourceHandle || !targetHandle) return null;
  if (sourceHandle === "out" && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle === "true" && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle === "false" && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle === "default" && targetHandle === "in") return { kind: "flow" };
  if (/^case_\d+$/.test(sourceHandle) && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle !== targetHandle) return null;
  if (!RESOURCE_HANDLES.has(sourceHandle as WorkflowHandleId)) return null;
  return { kind: "resource", handle: sourceHandle as WorkflowHandleId };
}

function isValidResourceWorkflowConnection(
  connection: Connection | Edge,
  handle: WorkflowHandleId,
  edges: Edge[],
  nodes: Node[],
): boolean {
  const excludeId = edgeId(connection);
  const sourceType = nodeTypeForId(nodes, connection.source);
  const targetType = nodeTypeForId(nodes, connection.target);

  if (targetType !== "agent") return false;

  const expectedSourceHandle = resourceHandleForNodeType(sourceType);
  if (expectedSourceHandle !== handle) return false;

  if (!SINGLE_CONNECTION_HANDLES.has(handle)) return true;

  if (countAgentHandleConnections(edges, connection.target, handle, excludeId) > 0) return false;
  if (countResourceNodeConnections(edges, connection.source, handle, excludeId) > 0) return false;

  return true;
}

/** Data flow uses out→in; resource handles connect when names match (resource node → agent). */
export function isValidWorkflowConnection(
  connection: Connection | Edge,
  edges: Edge[] = [],
  nodes: Node[] = [],
): boolean {
  const parsed = parseWorkflowConnectionHandles(connection);
  if (!parsed) return false;
  if (parsed.kind === "flow") return true;
  return isValidResourceWorkflowConnection(connection, parsed.handle, edges, nodes);
}

/** Data-flow edge (main or branch), excluding resource wiring. */
export function isDataFlowEdge(edge: Pick<Edge, "sourceHandle" | "targetHandle">): boolean {
  const targetHandle = edge.targetHandle ?? "in";
  if (targetHandle !== "in") return false;
  const sourceHandle = edge.sourceHandle ?? "out";
  return isBranchSourceHandle(sourceHandle);
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

/** Parent agent for a resource node (service / memory / tool) wired below an agent. */
export function getConnectedAgentId(
  resourceNodeId: string,
  edges: Edge[],
  nodeType?: string,
): string | null {
  const handle = nodeType ? RESOURCE_NODE_HANDLE[nodeType] : undefined;
  if (handle) {
    const edge = edges.find(
      (e) => e.source === resourceNodeId && e.sourceHandle === handle && e.targetHandle === handle,
    );
    return edge?.target ?? null;
  }

  for (const resourceHandle of RESOURCE_HANDLES) {
    const edge = edges.find(
      (e) =>
        e.source === resourceNodeId &&
        e.sourceHandle === resourceHandle &&
        e.targetHandle === resourceHandle,
    );
    if (edge) return edge.target;
  }

  return null;
}

/** Node id whose upstream data-flow output should populate the INPUT panel. */
export function resolveInputNodeId(nodeId: string, nodeType: string | undefined, edges: Edge[]): string {
  return getConnectedAgentId(nodeId, edges, nodeType) ?? nodeId;
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
