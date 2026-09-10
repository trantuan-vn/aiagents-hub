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
  | "loop"
  | "done"
  | `case_${number}`;

const RESOURCE_HANDLES = new Set<WorkflowHandleId>(["service", "memory", "tools"]);

const BRANCH_SOURCE_HANDLES = new Set<string>(["out", "true", "false", "default", "loop", "done"]);

function isBranchSourceHandle(handle: string): boolean {
  if (BRANCH_SOURCE_HANDLES.has(handle)) return true;
  return /^case_\d+$/.test(handle);
}

const SINGLE_CONNECTION_HANDLES = new Set<WorkflowHandleId>(["service", "memory"]);

const RAG_TOOL_KINDS = new Set(["save-rag", "get-rag"]);

/** Node type → resource handle it may connect through. */
export const RESOURCE_NODE_HANDLE: Record<string, WorkflowHandleId> = {
  service_node: "service",
  memory_node: "memory",
  tool_node: "tools",
};

function nodeData(node: Node | undefined): Record<string, unknown> {
  return (node?.data ?? {}) as Record<string, unknown>;
}

/** Get RAG / Save RAG — same service + memory resource hosts as Agent. */
export function isRagToolNode(node: Node | undefined): boolean {
  if (!node || node.type !== "tool_node") return false;
  return RAG_TOOL_KINDS.has(String(nodeData(node).toolKind ?? ""));
}

export function isRagResourceHost(node: Node | undefined): boolean {
  return node?.type === "agent" || isRagToolNode(node);
}

function isVectorizeMemoryNode(node: Node | undefined): boolean {
  if (!node || node.type !== "memory_node") return false;
  return String(nodeData(node).memoryKind ?? "vectorize") === "vectorize";
}

export function isResourceEdge(edge: Pick<Edge, "sourceHandle" | "targetHandle">): boolean {
  const handle = edge.sourceHandle ?? edge.targetHandle;
  return handle != null && RESOURCE_HANDLES.has(handle as WorkflowHandleId);
}

function resourceHandleForNodeType(nodeType: string | undefined): WorkflowHandleId | null {
  if (!nodeType) return null;
  return RESOURCE_NODE_HANDLE[nodeType] ?? null;
}

function edgeId(connection: Connection | Edge): string | undefined {
  return "id" in connection ? connection.id : undefined;
}

/** Resource nodes (service/memory/tools) are sources; Agent / RAG tools are targets. */
export function normalizeResourceConnection<T extends Connection | Edge>(
  connection: T,
  nodes: Node[],
): T {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;
  if (!sourceNode || !targetNode || !sourceHandle || !targetHandle) return connection;
  if (sourceHandle !== targetHandle) return connection;
  if (!RESOURCE_HANDLES.has(sourceHandle as WorkflowHandleId)) return connection;

  const alreadyResourceToHost =
    resourceHandleForNodeType(sourceNode.type) === sourceHandle && isRagResourceHost(targetNode);
  if (alreadyResourceToHost) return connection;

  const reversedHostToResource =
    isRagResourceHost(sourceNode) && resourceHandleForNodeType(targetNode.type) === targetHandle;
  if (!reversedHostToResource) return connection;

  return {
    ...connection,
    source: connection.target,
    target: connection.source,
    sourceHandle: connection.targetHandle,
    targetHandle: connection.sourceHandle,
  };
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
  if (sourceHandle === "loop" && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle === "done" && targetHandle === "in") return { kind: "flow" };
  if (/^case_\d+$/.test(sourceHandle) && targetHandle === "in") return { kind: "flow" };
  if (sourceHandle !== targetHandle) return null;
  if (!RESOURCE_HANDLES.has(sourceHandle as WorkflowHandleId)) return null;
  return { kind: "resource", handle: sourceHandle as WorkflowHandleId };
}

function isValidResourceWorkflowConnection(
  connection: Connection | Edge,
  handle: WorkflowHandleId,
  nodes: Node[],
): boolean {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!isRagResourceHost(targetNode)) return false;

  const expectedSourceHandle = resourceHandleForNodeType(sourceNode?.type);
  if (expectedSourceHandle !== handle) return false;

  if (handle === "memory" && isRagToolNode(targetNode) && !isVectorizeMemoryNode(sourceNode)) {
    return false;
  }

  // Service / memory: one incoming per host. A second drag replaces the existing edge in onConnect.
  return true;
}

/** Drop the existing service/memory edge on the host so a new Vectorize/service can take its place. */
export function withoutReplacedResourceEdge(edges: Edge[], connection: Connection | Edge): Edge[] {
  const handle = (connection.targetHandle ?? "") as WorkflowHandleId;
  if (!SINGLE_CONNECTION_HANDLES.has(handle)) return edges;
  const excludeId = edgeId(connection);
  return edges.filter(
    (e) =>
      e.id === excludeId ||
      !(e.target === connection.target && e.targetHandle === handle && RESOURCE_HANDLES.has(handle)),
  );
}

/** Data flow uses out→in; resource handles connect when names match (resource → Agent / RAG tool). */
export function isValidWorkflowConnection(
  connection: Connection | Edge,
  _edges: Edge[] = [],
  nodes: Node[] = [],
): boolean {
  const normalized = normalizeResourceConnection(connection, nodes);
  const parsed = parseWorkflowConnectionHandles(normalized);
  if (!parsed) return false;
  if (parsed.kind === "flow") return true;
  return isValidResourceWorkflowConnection(normalized, parsed.handle, nodes);
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
  const onDataFlow = edges.some((e) => e.target === nodeId && isDataFlowEdge(e));
  if (onDataFlow) return nodeId;
  return getConnectedAgentId(nodeId, edges, nodeType) ?? nodeId;
}

/** Incoming data-flow edge for a node (loop / done / out → in). */
export function getUpstreamDataFlowEdge(nodeId: string, edges: Edge[]): Edge | undefined {
  return edges.find((e) => e.target === nodeId && isDataFlowEdge(e));
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
