import type { WorkflowNodeDefinition } from "./node-definition";
import type { GraphNode } from "./graph";

const RESOURCE_HANDLES = new Set(["service", "memory", "tools"]);
const BRANCH_SOURCE_HANDLES = new Set(["out", "true", "false", "default", "loop", "done"]);

function isBranchSourceHandle(handle: string | null | undefined): boolean {
  if (!handle || handle === "in") return false;
  if (BRANCH_SOURCE_HANDLES.has(handle)) return true;
  return /^case_\d+$/.test(handle);
}

function resolveNodeKind(node: GraphNode): string | undefined {
  const data = node.data ?? {};
  if (typeof data.coreKind === "string") return data.coreKind;
  if (typeof data.flowKind === "string") return data.flowKind;
  if (typeof data.triggerKind === "string") return data.triggerKind;
  return undefined;
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

  // Resource wiring (service/memory/tools)
  if (sourceHandle === targetHandle && RESOURCE_HANDLES.has(sourceHandle)) {
    return targetNode.type === "agent";
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
