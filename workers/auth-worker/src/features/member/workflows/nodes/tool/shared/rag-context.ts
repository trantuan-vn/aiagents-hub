import type { WorkflowDefinition } from '../../../domain/domain.js';
import { resolveAgentResources } from '../../../engine/graph-helpers.js';
import { getServiceModel } from '../../../../../admin/service/pricing.js';
import { DEFAULT_EMBED_MODEL, VECTORIZE_COLLECTION } from '../../../rag-vector.js';
import { normalizeVectorizeCollection, type VectorizeScopeContext } from '../../../vectorize-scope.js';

export type RagResourceContext = {
  collection: string;
  namespace: string;
  embedModel: string;
  serviceEndpoint?: string;
  memoryNodeId?: string;
};

function findLinkedMemoryNode(
  definition: WorkflowDefinition,
  agentId: string,
): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => {
    if (n.type !== 'memory_node') return false;
    return definition.edges.some(
      (e) => e.source === n.id && e.target === agentId && e.targetHandle === 'memory',
    );
  });
}

export function resolveRagResources(
  definition: WorkflowDefinition,
  agentId: string,
  embedModelOverride?: string,
  scope?: VectorizeScopeContext,
): RagResourceContext {
  const linked = resolveAgentResources(definition, agentId, scope);
  const memData = (linked.memoryNodeId
    ? definition.nodes.find((n) => n.id === linked.memoryNodeId)?.data
    : findLinkedMemoryNode(definition, agentId)?.data) as Record<string, unknown> | undefined;

  return {
    collection: normalizeVectorizeCollection(
      String(linked.memoryCollection ?? memData?.collection ?? VECTORIZE_COLLECTION).trim(),
    ),
    namespace: linked.memoryNamespace ?? '',
    embedModel: embedModelOverride ?? DEFAULT_EMBED_MODEL,
    serviceEndpoint: linked.serviceEndpoint,
    memoryNodeId: linked.memoryNodeId,
  };
}

export function resolveEmbedModelFromService(service: Record<string, unknown>): string {
  const catalog = String(service.catalogId ?? service.catalog_id ?? '').trim().toLowerCase();
  const explicit = String(service.embedModel ?? service.embed_model ?? '').trim();
  if (explicit) return explicit;

  const model = getServiceModel(service);
  if (model) {
    const lower = model.toLowerCase();
    if (lower.includes('bge') || lower.includes('embed')) return model;
  }
  if (catalog.includes('bge') || catalog.includes('embed')) {
    return model ?? DEFAULT_EMBED_MODEL;
  }
  return DEFAULT_EMBED_MODEL;
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
