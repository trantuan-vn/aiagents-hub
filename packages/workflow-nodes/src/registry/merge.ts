import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from "../types/node-definition";

/** Merge admin KV overrides on top of built-in definitions (custom nodes replace by id). */
export function mergeNodeRegistries(
  builtins: WorkflowNodeDefinition[],
  overrides: WorkflowNodeDefinition[] = [],
): WorkflowNodeRegistry {
  const byId = new Map<string, WorkflowNodeDefinition>();
  for (const node of builtins) byId.set(node.id, node);
  for (const node of overrides) byId.set(node.id, node);
  return {
    nodes: [...byId.values()],
    updatedAt: new Date().toISOString(),
  };
}
