import { embedText, upsertVectors, type VectorizeVectorRecord, DEFAULT_EMBED_MODEL } from '../../../rag-vector.js';
import { resolveServiceByEndpoint } from '../../../billing/billing.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  resolveEmbedModelFromService,
  resolveRagResources,
  toolNodeConfig,
} from '../shared/rag-context.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { pipelineItems, resolvePipelineField, stringifyUnknown } from '../shared/pipeline.js';
import { chunkText } from './chunk.js';

export type SaveRagChunkInput = {
  content: string;
  index: number;
};

export type SaveRagInput = {
  content: string;
  documentId?: string;
  source?: string;
  chunks?: SaveRagChunkInput[];
  metadata?: Record<string, string>;
};

export type SaveRagResult = {
  ok: boolean;
  saved: number;
  documentId: string;
  collection: string;
};

export type SaveRagExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  input: SaveRagInput;
  embedModel?: string;
  userDO?: DurableObjectStub<UserDO>;
  ownerId?: string;
  workflowId?: number;
};

function vectorId(documentId: string, index: number): string {
  const raw = `${documentId}::chunk-${index}`;
  if (raw.length <= 64) return raw;
  const suffix = `::c${index}`;
  return raw.slice(0, 64 - suffix.length) + suffix;
}

async function resolveSaveRagEmbedModel(
  config: Record<string, unknown>,
  params: SaveRagExecuteParams,
): Promise<string> {
  const serviceEndpoint = String(config.serviceEndpoint ?? '').trim();
  if (serviceEndpoint && params.userDO) {
    const service = await resolveServiceByEndpoint(params.userDO, serviceEndpoint);
    return resolveEmbedModelFromService(service);
  }
  return params.embedModel ?? DEFAULT_EMBED_MODEL;
}

export async function executeSaveRag(params: SaveRagExecuteParams): Promise<SaveRagResult> {
  const { env, definition, agentId, input } = params;
  const config = toolNodeConfig(definition, agentId, 'save-rag') ?? {};
  const embedModel = await resolveSaveRagEmbedModel(config, params);
  const rag = resolveRagResources(definition, agentId, embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });

  const chunkSize = Number(config.chunkSize ?? 800) || 800;
  const chunkOverlap = Number(config.chunkOverlap ?? 120) || 120;
  const documentId = String(input.documentId ?? crypto.randomUUID());
  const source = String(input.source ?? input.metadata?.source ?? documentId);
  const namespace = rag.namespace || input.metadata?.namespace || '';

  const textChunks =
    input.chunks?.length
      ? input.chunks.map((c) => ({ content: c.content, index: c.index }))
      : chunkText(input.content, chunkSize, chunkOverlap);

  if (!textChunks.length) {
    return { ok: false, saved: 0, documentId, collection: rag.collection };
  }

  const vectors: VectorizeVectorRecord[] = [];

  for (const chunk of textChunks) {
    const values = await embedText(env, chunk.content, rag.embedModel);
    if (!values.length) continue;

    const metadata: Record<string, string> = {
      text: chunk.content,
      content: chunk.content,
      source,
      documentId,
      chunkIndex: String(chunk.index),
      ...(namespace ? { namespace } : {}),
      ...(input.metadata ?? {}),
    };

    vectors.push({
      id: vectorId(documentId, chunk.index),
      values,
      metadata,
    });
  }

  const saved = await upsertVectors(env, rag.collection, vectors);
  return { ok: saved > 0, saved, documentId, collection: rag.collection };
}

function metadataFromItem(item: Record<string, unknown>): Record<string, string> {
  const raw = item.metadata;
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v != null) out[k] = String(v);
    }
  }
  for (const key of ['docType', 'tableName', 'schemaName', 'dbId', 'namespace']) {
    if (item[key] != null && out[key] == null) out[key] = String(item[key]);
  }
  return out;
}

/** Graph-path execute (pipeline_auto / loop item): chunk + embed + upsert. */
export async function executeSaveRagPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const items = pipelineItems(ctx.nodeInput);
  if (!items.length) {
    throw new Error('save_rag: no content to save (upstream item is empty)');
  }

  const results: SaveRagResult[] = [];
  for (const item of items) {
    const content =
      resolvePipelineField(data.contentField, item, ctx.nodeInput, ['content', 'text', 'ddl']) ||
      stringifyUnknown(item.content ?? item.text ?? item);
    if (!String(content).trim()) continue;

    const documentId = resolvePipelineField(data.documentIdField, item, ctx.nodeInput, [
      'documentId',
      'id',
    ]);
    const source = resolvePipelineField(data.sourceField, item, ctx.nodeInput, ['source']);

    results.push(
      await executeSaveRag({
        env: ctx.c.env,
        definition: ctx.definition,
        agentId: ctx.node.id,
        input: {
          content,
          documentId: documentId || undefined,
          source: source || undefined,
          metadata: metadataFromItem(item),
        },
        userDO: ctx.userDO,
        ownerId: ctx.meta.ownerId,
        workflowId: ctx.meta.workflowId,
      }),
    );
  }

  const saved = results.reduce((sum, r) => sum + r.saved, 0);
  return {
    ok: results.some((r) => r.ok),
    saved,
    items: results,
    documentIds: results.map((r) => r.documentId),
    collection: results[0]?.collection,
  };
}
