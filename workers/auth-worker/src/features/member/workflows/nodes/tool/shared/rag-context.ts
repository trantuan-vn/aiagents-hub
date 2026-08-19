import type { WorkflowDefinition } from '../../../domain/domain.js';
import { resolveAgentResources } from '../../../engine/graph-helpers.js';
import { getServiceModel } from '../../../../../admin/service/pricing.js';
import { DEFAULT_EMBED_MODEL, VECTORIZE_COLLECTION } from '../../../rag-vector.js';
import {
  normalizeVectorizeCollection,
  resolveVectorizeScope,
  type VectorizeScopeContext,
} from '../../../vectorize-scope.js';

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

function firstMemoryNode(definition: WorkflowDefinition): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => n.type === 'memory_node');
}

function workflowNamespace(scope?: VectorizeScopeContext): string {
  if (!scope?.ownerId || !scope.workflowId) return '';
  return `u${scope.ownerId}/wf${scope.workflowId}`;
}

function memoryNamespaceFromNode(
  node: WorkflowDefinition['nodes'][number] | undefined,
  scope?: VectorizeScopeContext,
): string {
  if (!node) return '';
  const data = (node.data ?? {}) as Record<string, unknown>;
  const configured = String(data.namespace ?? '').trim();
  if (scope?.ownerId && scope.workflowId) {
    return resolveVectorizeScope(scope.ownerId, scope.workflowId, node.id, configured);
  }
  return configured;
}

export function resolveRagResources(
  definition: WorkflowDefinition,
  agentId: string,
  embedModelOverride?: string,
  scope?: VectorizeScopeContext,
): RagResourceContext {
  const linked = resolveAgentResources(definition, agentId, scope);
  const self = definition.nodes.find((n) => n.id === agentId);
  const selfData = (self?.data ?? {}) as Record<string, unknown>;

  const linkedMem =
    linked.memoryNodeId != null
      ? definition.nodes.find((n) => n.id === linked.memoryNodeId)
      : findLinkedMemoryNode(definition, agentId);
  const fallbackMem = linkedMem ?? firstMemoryNode(definition);
  const memData = (fallbackMem?.data ?? {}) as Record<string, unknown> | undefined;

  const collection = normalizeVectorizeCollection(
    String(
      selfData.collection ??
        linked.memoryCollection ??
        memData?.collection ??
        VECTORIZE_COLLECTION,
    ).trim(),
  );

  const toolNamespace = String(selfData.namespace ?? '').trim();
  const namespace =
    toolNamespace ||
    linked.memoryNamespace ||
    memoryNamespaceFromNode(fallbackMem, scope) ||
    workflowNamespace(scope);

  return {
    collection,
    namespace,
    embedModel: embedModelOverride ?? DEFAULT_EMBED_MODEL,
    serviceEndpoint: String(selfData.serviceEndpoint ?? linked.serviceEndpoint ?? '').trim() || linked.serviceEndpoint,
    memoryNodeId: linked.memoryNodeId ?? fallbackMem?.id,
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
  if (tool?.config && typeof tool.config === 'object') {
    return tool.config as Record<string, unknown>;
  }

  const self = definition.nodes.find((n) => n.id === agentId && n.type === 'tool_node');
  if (self) {
    const kind = String((self.data as Record<string, unknown> | undefined)?.toolKind ?? '');
    if (!toolKind || kind === toolKind) return (self.data ?? {}) as Record<string, unknown>;
  }

  return undefined;
}
