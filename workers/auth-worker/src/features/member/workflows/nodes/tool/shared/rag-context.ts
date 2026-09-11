import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import { modelIdToServiceEndpoint } from '../../../../../admin/service/model-search.js';
import { estimateEmbeddingPromptTokens, getServiceModel, type AiUsage } from '../../../../../admin/service/pricing.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import {
  billEmbeddingUsage,
  ensureWalletBalance,
  findApprovedServiceByEndpoint,
  findApprovedServiceByModel,
  resolveServiceByEndpoint,
} from '../../../billing/billing.js';
import { resolveAgentResources } from '../../../engine/graph-helpers.js';
import {
  DEFAULT_EMBED_MODEL,
  VECTORIZE_COLLECTION,
  normalizeVectorizeCollection,
  resolveVectorizeScope,
  type VectorizeScopeContext,
} from '../../../rag/index.js';
import type { NodeContext, WorkflowAttribution } from '../../types.js';

export type RagResourceContext = {
  collection: string;
  namespace: string;
  embedModel: string;
  serviceEndpoint?: string;
  memoryNodeId?: string;
  memoryKind?: string;
  dimensions?: number;
  metric?: string;
};

const RAG_TOOL_KINDS = new Set(['save-rag', 'get-rag']);

function toolKindOf(node: WorkflowDefinition['nodes'][number] | undefined): string {
  return String((node?.data as Record<string, unknown> | undefined)?.toolKind ?? '');
}

function findLinkedMemoryNode(
  definition: WorkflowDefinition,
  hostId: string,
): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => {
    if (n.type !== 'memory_node') return false;
    return definition.edges.some(
      (e) => e.source === n.id && e.target === hostId && e.targetHandle === 'memory',
    );
  });
}

function firstMemoryNode(definition: WorkflowDefinition): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => n.type === 'memory_node');
}

function findSaveRagNode(
  definition: WorkflowDefinition,
  excludeId?: string,
): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => {
    if (n.id === excludeId || n.type !== 'tool_node') return false;
    return toolKindOf(n) === 'save-rag';
  });
}

function findLinkedAgentId(definition: WorkflowDefinition, toolId: string): string | undefined {
  return definition.edges.find(
    (e) => e.source === toolId && e.sourceHandle === 'tools' && e.targetHandle === 'tools',
  )?.target;
}

/** Resolve the Get/Save RAG tool node from an agent or the tool itself. */
export function findRagToolNodeId(
  definition: WorkflowDefinition,
  hostId: string,
  toolKind: string,
): string {
  const self = definition.nodes.find((n) => n.id === hostId);
  if (self?.type === 'tool_node' && (!toolKind || toolKindOf(self) === toolKind)) {
    return hostId;
  }
  const linked = resolveAgentResources(definition, hostId);
  const tool = linked.tools.find((t) => String(t.kind ?? '') === toolKind);
  return typeof tool?.id === 'string' ? tool.id : hostId;
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

function mergeResourceContext(
  primary: ReturnType<typeof resolveAgentResources>,
  fallback: ReturnType<typeof resolveAgentResources>,
): ReturnType<typeof resolveAgentResources> {
  return {
    ...fallback,
    ...primary,
    serviceEndpoint: primary.serviceEndpoint || fallback.serviceEndpoint,
    serviceOptions: primary.serviceOptions ?? fallback.serviceOptions,
    memoryCollection: primary.memoryCollection || fallback.memoryCollection,
    memoryKind: primary.memoryKind || fallback.memoryKind,
    memoryNamespace: primary.memoryNamespace || fallback.memoryNamespace,
    memoryNodeId: primary.memoryNodeId || fallback.memoryNodeId,
    memoryDimensions: primary.memoryDimensions ?? fallback.memoryDimensions,
    memoryMetric: primary.memoryMetric || fallback.memoryMetric,
    tools: primary.tools.length ? primary.tools : fallback.tools,
  };
}

export function resolveRagResources(
  definition: WorkflowDefinition,
  agentId: string,
  embedModelOverride?: string,
  scope?: VectorizeScopeContext,
): RagResourceContext {
  const self = definition.nodes.find((n) => n.id === agentId);
  const selfData = (self?.data ?? {}) as Record<string, unknown>;
  const selfKind = toolKindOf(self);
  const toolId =
    self?.type === 'tool_node' && RAG_TOOL_KINDS.has(selfKind)
      ? agentId
      : findRagToolNodeId(definition, agentId, selfKind === 'get-rag' || selfKind === 'save-rag' ? selfKind : '');
  const toolNode = definition.nodes.find((n) => n.id === toolId) ?? self;
  const toolKind = toolKindOf(toolNode);
  const toolData = (toolNode?.data ?? {}) as Record<string, unknown>;

  let linked = resolveAgentResources(definition, toolId, scope);

  // Get RAG without its own Vectorize reads the same index Save RAG wrote.
  if (toolKind === 'get-rag' && !linked.memoryNodeId) {
    const save = findSaveRagNode(definition, toolId);
    if (save) {
      const inherited = resolveRagResources(definition, save.id, embedModelOverride, scope);
      return {
        ...inherited,
        serviceEndpoint: linked.serviceEndpoint || inherited.serviceEndpoint,
      };
    }
  }

  if (!linked.memoryNodeId || !linked.serviceEndpoint) {
    const agentHost = findLinkedAgentId(definition, toolId);
    if (agentHost) {
      linked = mergeResourceContext(linked, resolveAgentResources(definition, agentHost, scope));
    }
  }

  const linkedMem =
    linked.memoryNodeId != null
      ? definition.nodes.find((n) => n.id === linked.memoryNodeId)
      : findLinkedMemoryNode(definition, toolId);
  const fallbackMem = linkedMem ?? firstMemoryNode(definition);
  const memData = (fallbackMem?.data ?? {}) as Record<string, unknown> | undefined;

  const collection = normalizeVectorizeCollection(
    String(
      toolData.collection ??
        selfData.collection ??
        linked.memoryCollection ??
        memData?.collection ??
        VECTORIZE_COLLECTION,
    ).trim(),
  );

  const toolNamespace = String(toolData.namespace ?? selfData.namespace ?? '').trim();
  const namespace =
    toolNamespace ||
    linked.memoryNamespace ||
    memoryNamespaceFromNode(fallbackMem, scope) ||
    workflowNamespace(scope);

  const dims = Number(linked.memoryDimensions ?? memData?.dimensions);
  const metric = String(linked.memoryMetric ?? memData?.metric ?? '').trim();

  return {
    collection,
    namespace,
    embedModel: embedModelOverride ?? DEFAULT_EMBED_MODEL,
    serviceEndpoint:
      String(linked.serviceEndpoint ?? toolData.serviceEndpoint ?? selfData.serviceEndpoint ?? '').trim() ||
      undefined,
    memoryNodeId: linked.memoryNodeId ?? fallbackMem?.id,
    memoryKind: linked.memoryKind ?? (fallbackMem ? String(memData?.memoryKind ?? 'vectorize') : undefined),
    dimensions: Number.isFinite(dims) && dims > 0 ? dims : undefined,
    metric: metric || undefined,
  };
}

export type RagBilling = {
  env: Env;
  bindingName: string;
  userDO: DurableObjectStub<UserDO>;
  consumerIdentifier: string;
  requestMeta?: { userAgent?: string; ipAddress?: string };
  workflowAttribution?: WorkflowAttribution;
  onCost?: (usd: number) => void;
};

export type ResolvedRagEmbed = {
  model: string;
  service?: Record<string, unknown>;
  endpoint: string;
};

export function ragBillingFromNodeContext(ctx: NodeContext): RagBilling | undefined {
  if (!ctx.userDO || !ctx.bindingName || !ctx.user?.identifier) return undefined;
  return {
    env: ctx.c.env,
    bindingName: ctx.bindingName,
    userDO: ctx.userDO,
    consumerIdentifier: ctx.user.identifier,
    requestMeta: ctx.requestMeta,
    workflowAttribution: ctx.attr,
    onCost: ctx.onCost,
  };
}

export async function resolveRagEmbedService(
  config: Record<string, unknown> | undefined,
  params: { embedModel?: string; userDO?: DurableObjectStub<UserDO> },
): Promise<ResolvedRagEmbed> {
  const configuredEndpoint = String(config?.serviceEndpoint ?? '').trim();
  if (configuredEndpoint && params.userDO) {
    const service = await resolveServiceByEndpoint(params.userDO, configuredEndpoint);
    return {
      model: resolveEmbedModelFromService(service),
      service,
      endpoint: configuredEndpoint,
    };
  }

  const model = params.embedModel ?? DEFAULT_EMBED_MODEL;
  const fallbackEndpoint = modelIdToServiceEndpoint(model);
  if (params.userDO) {
    const service =
      (await findApprovedServiceByEndpoint(params.userDO, fallbackEndpoint)) ??
      (await findApprovedServiceByModel(params.userDO, model));
    if (service) {
      return {
        model: resolveEmbedModelFromService(service) || model,
        service,
        endpoint: String(service.endpoint ?? fallbackEndpoint),
      };
    }
  }
  return { model, endpoint: fallbackEndpoint };
}

export async function resolveRagEmbedModel(
  config: Record<string, unknown> | undefined,
  params: { embedModel?: string; userDO?: DurableObjectStub<UserDO> },
): Promise<string> {
  return (await resolveRagEmbedService(config, params)).model;
}

export async function billRagEmbeddings(
  embed: ResolvedRagEmbed,
  billing: RagBilling | undefined,
  texts: string[],
  usage?: AiUsage,
): Promise<number> {
  if (!billing) return 0;
  const promptTokens = Number(usage?.prompt_tokens ?? 0) || estimateEmbeddingPromptTokens(texts);
  if (promptTokens <= 0) return 0;
  if (!embed.service || !embed.endpoint) {
    console.warn('[rag] embedding ran but no approved embedding service was found to bill');
    return 0;
  }
  await ensureWalletBalance(billing.userDO);
  const costUsd = await billEmbeddingUsage(
    billing.env,
    billing.bindingName,
    billing.userDO,
    billing.consumerIdentifier,
    embed.service,
    {
      endpoint: embed.endpoint,
      promptTokens,
      userAgent: billing.requestMeta?.userAgent,
      ipAddress: billing.requestMeta?.ipAddress,
      workflowAttribution: billing.workflowAttribution,
    },
  );
  billing.onCost?.(costUsd);
  return costUsd;
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
