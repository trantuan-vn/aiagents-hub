import type { WorkflowNodeDefinition } from "./node-definition";
import type { GraphNode } from "./graph";

const RESOURCE_HANDLES = new Set(["service", "memory", "tools"]);
const RESOURCE_NODE_HANDLE: Record<string, string> = {
  service_node: "service",
  memory_node: "memory",
  tool_node: "tools",
};
const BRANCH_SOURCE_HANDLES = new Set(["out", "true", "false", "default", "loop", "done"]);

function isBranchSourceHandle(handle: string | null | undefined): boolean {
  if (!handle || handle === "in") return false;
  if (BRANCH_SOURCE_HANDLES.has(handle)) return true;
  return /^case_\d+$/.test(handle);
}

const RAG_TOOL_KINDS = new Set(["save-rag", "get-rag"]);

function nodeData(node: GraphNode): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

function resolveNodeKind(node: GraphNode): string | undefined {
  const data = nodeData(node);
  if (typeof data.coreKind === "string") return data.coreKind;
  if (typeof data.flowKind === "string") return data.flowKind;
  if (typeof data.triggerKind === "string") return data.triggerKind;
  if (typeof data.toolKind === "string") return data.toolKind;
  if (typeof data.memoryKind === "string") return data.memoryKind;
  return undefined;
}

function isRagToolNode(node: GraphNode): boolean {
  return node.type === "tool_node" && RAG_TOOL_KINDS.has(String(nodeData(node).toolKind ?? ""));
}

function isRagResourceHost(node: GraphNode): boolean {
  return node.type === "agent" || isRagToolNode(node);
}

function isVectorizeMemoryNode(node: GraphNode): boolean {
  if (node.type !== "memory_node") return false;
  return String(nodeData(node).memoryKind ?? "vectorize") === "vectorize";
}

function getDefinition(
  node: GraphNode,
  definitions: Map<string, WorkflowNodeDefinition>,
): WorkflowNodeDefinition | undefined {
  const kind = resolveNodeKind(node);
  if (kind) {
    const byComposite = definitions.get(`${node.type}:${kind}`);
    if (byComposite) return byComposite;
  }
  return definitions.get(node.type);
}

/** Validate a connection between two graph nodes using handle metadata from definitions. */
export function isValidWorkflowConnection(
  sourceNode: GraphNode,
  sourceHandle: string | null,
  targetNode: GraphNode,
  targetHandle: string | null,
  definitions: Map<string, WorkflowNodeDefinition>,
): boolean {
  if (!sourceHandle || !targetHandle) return false;

  // Main / branch data flow
  if (targetHandle === "in") {
    return isBranchSourceHandle(sourceHandle);
  }

  // Resource wiring (service/memory/tools) ↔ Agent or Get/Save RAG (either drag direction)
  if (sourceHandle === targetHandle && RESOURCE_HANDLES.has(sourceHandle)) {
    const forward =
      isRagResourceHost(targetNode) && RESOURCE_NODE_HANDLE[sourceNode.type] === sourceHandle;
    const reversed =
      isRagResourceHost(sourceNode) && RESOURCE_NODE_HANDLE[targetNode.type] === targetHandle;
    if (!forward && !reversed) return false;
    const host = forward ? targetNode : sourceNode;
    const resource = forward ? sourceNode : targetNode;
    if (sourceHandle === "memory" && isRagToolNode(host) && !isVectorizeMemoryNode(resource)) {
      return false;
    }
    return true;
  }

  const sourceDef = getDefinition(sourceNode, definitions);
  const targetDef = getDefinition(targetNode, definitions);
  if (!sourceDef?.handles?.length && !targetDef?.handles?.length) {
    return sourceHandle === "out" && targetHandle === "in";
  }

  const sourceHandleDef = sourceDef?.handles?.find(
    (h: { id: string; type: string }) => h.id === sourceHandle && h.type === "source",
  );
  const targetHandleDef = targetDef?.handles?.find(
    (h: { id: string; type: string }) => h.id === targetHandle && h.type === "target",
  );
  return Boolean(sourceHandleDef && targetHandleDef);
}
