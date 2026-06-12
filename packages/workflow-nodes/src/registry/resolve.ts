import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from "../types/node-definition";

export function resolveNodeDefinition(
  runtimeType: string,
  kind?: string,
  registry?: WorkflowNodeRegistry,
): WorkflowNodeDefinition | undefined {
  const nodes = registry?.nodes ?? [];
  if (kind) {
    const byKind = nodes.find((n) => n.runtimeType === runtimeType && n.kind === kind);
    if (byKind) return byKind;
    const compositeId = `${runtimeType}:${kind}`;
    const byComposite = nodes.find((n) => n.id === compositeId);
    if (byComposite) return byComposite;
  }
  return nodes.find((n) => n.id === runtimeType || (n.runtimeType === runtimeType && !n.kind));
}
