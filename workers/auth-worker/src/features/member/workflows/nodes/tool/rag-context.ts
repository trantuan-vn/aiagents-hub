import type { WorkflowDefinition } from '../../domain/domain.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import { DEFAULT_EMBED_MODEL } from '../../rag-vector.js';

export type RagResourceContext = {
  collection: string;
  namespace: string;
  embedModel: string;
  serviceEndpoint?: string;
};

export function resolveRagResources(
  definition: WorkflowDefinition,
  agentId: string,
  embedModelOverride?: string,
): RagResourceContext {
  const linked = resolveAgentResources(definition, agentId);
  const memoryNode = definition.nodes.find((n) => {
    if (n.type !== 'memory_node') return false;
    return definition.edges.some(
      (e) => e.source === n.id && e.target === agentId && e.targetHandle === 'memory',
    );
  });
  const memData = (memoryNode?.data ?? {}) as Record<string, unknown>;

  return {
    collection: String(linked.memoryCollection ?? memData.collection ?? 'vectorize-default').trim(),
    namespace: String(memData.namespace ?? '').trim(),
    embedModel: embedModelOverride ?? DEFAULT_EMBED_MODEL,
    serviceEndpoint: linked.serviceEndpoint,
  };
}

export function toolNodeConfig(
  definition: WorkflowDefinition,
  agentId: string,
  toolKind: string,
): Record<string, unknown> | undefined {
  const linked = resolveAgentResources(definition, agentId);
  const tool = linked.tools.find((t) => String(t.kind ?? '') === toolKind);
  return (tool?.config as Record<string, unknown> | undefined) ?? undefined;
}
