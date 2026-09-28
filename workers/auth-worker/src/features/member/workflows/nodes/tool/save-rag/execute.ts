import { embedTextsWithUsage, upsertVectors, vectorChunkId, type VectorizeVectorRecord } from '../../../rag/index.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import { embeddingUsageOrEstimate, mergeAiUsage, type AiUsage } from '../../../../../admin/service/pricing.js';
import {
  billRagEmbeddings,
  ragBillingFromNodeContext,
  resolveRagEmbedService,
  resolveRagResources,
  findRagToolNodeId,
  toolNodeConfig,
  type RagBilling,
} from '../shared/rag-context.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { resolveOracleConnectConfig } from '../shared/db/index.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';
import { chunkDocument } from './chunk.js';
import { describeTable } from './describe-table.js';
import { ragDocumentsFromEnrichment, type RagDocumentItem } from './documents.js';
import { introspectTablesInfo } from './table-docs.js';

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
  raw?: { usage: AiUsage };
};

type SaveRagManyResult = {
  results: SaveRagResult[];
  usage?: AiUsage;
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
  billing?: RagBilling;
};

const INDEXED_TABLES_KEY = '__saveRagIndexedTables';
const VECTORIZE_UPSERT_LIMIT = 1000;

async function executeSaveRagMany(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  docs: SaveRagInput[];
  embedModel?: string;
  userDO?: DurableObjectStub<UserDO>;
  ownerId?: string;
  workflowId?: number;
  billing?: RagBilling;
}): Promise<SaveRagManyResult> {
  const toolId = findRagToolNodeId(params.definition, params.agentId, 'save-rag');
  const config =
    toolNodeConfig(params.definition, toolId, 'save-rag') ??
    toolNodeConfig(params.definition, params.agentId, 'save-rag') ??
    {};
  const rag = resolveRagResources(params.definition, toolId, params.embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });
  const embed = await resolveRagEmbedService(
    { ...config, serviceEndpoint: rag.serviceEndpoint ?? config.serviceEndpoint },
    {
      embedModel: params.embedModel,
      userDO: params.userDO ?? params.billing?.userDO,
    },
  );
  type Pending = {
    documentId: string;
    source: string;
    metadata: Record<string, string>;
    chunks: Array<{ content: string; index: number }>;
  };

  const pending: Pending[] = [];
  for (const input of params.docs) {
    const content = String(input.content ?? '');
    if (!content.trim()) continue;
    const documentId = String(input.documentId ?? crypto.randomUUID());
    const source = String(input.source ?? input.metadata?.source ?? documentId);
    const namespace = rag.namespace || input.metadata?.namespace || '';
    const chunks = input.chunks?.length
      ? input.chunks.map((c) => ({ content: c.content, index: c.index }))
      : chunkDocument(content, {
          ...(input.metadata ?? {}),
          documentId,
          source,
          ...(namespace ? { namespace } : {}),
        });
    if (!chunks.length) continue;
    pending.push({
      documentId,
      source,
      metadata: input.metadata ?? {},
      chunks,
    });
  }

  if (!pending.length) {
    return {
      results: params.docs.map((input) => ({
        ok: false,
        saved: 0,
        documentId: String(input.documentId ?? ''),
        collection: rag.collection,
      })),
    };
  }

  const flatTexts: string[] = [];
  const owners: Array<{ doc: Pending; chunk: { content: string; index: number } }> = [];
  for (const doc of pending) {
    for (const chunk of doc.chunks) {
      flatTexts.push(chunk.content);
      owners.push({ doc, chunk });
    }
  }

  const { vectors: embeddings, usage: embedUsage } = await embedTextsWithUsage(
    params.env,
    flatTexts,
    embed.model,
  );
  if (embeddings.some((values) => !values.length)) {
    throw new Error('save_rag: empty embedding; table was not saved');
  }
  const billedTexts = flatTexts.filter((text) => text.trim());
  const usage = embeddingUsageOrEstimate(billedTexts, embedUsage);
  await billRagEmbeddings(embed, params.billing, billedTexts, usage);
  if (rag.dimensions) {
    const mismatch = embeddings.find((values) => values.length > 0 && values.length !== rag.dimensions);
    if (mismatch) {
      throw new Error(
        `Save RAG embedding dimensions (${mismatch.length}) do not match Vectorize index (${rag.dimensions})`,
      );
    }
  }
  const vectors: VectorizeVectorRecord[] = [];
  const savedByDoc = new Map<string, number>();
  const totalChunksByDoc = new Map<string, number>();
  for (const { doc } of owners) {
    totalChunksByDoc.set(doc.documentId, (totalChunksByDoc.get(doc.documentId) ?? 0) + 1);
  }

  for (let i = 0; i < owners.length; i++) {
    const values = embeddings[i] ?? [];
    const { doc, chunk } = owners[i]!;
    const namespace = rag.namespace || doc.metadata.namespace || '';
    vectors.push({
      id: await vectorChunkId(doc.documentId, chunk.index),
      values,
      metadata: {
        text: chunk.content,
        source: doc.source,
        documentId: doc.documentId,
        chunkIndex: String(chunk.index),
        totalChunks: String(totalChunksByDoc.get(doc.documentId) ?? 1),
        ...doc.metadata,
        ...(namespace ? { namespace } : {}),
        formatVersion: '2',
      },
    });
    savedByDoc.set(doc.documentId, (savedByDoc.get(doc.documentId) ?? 0) + 1);
  }

  for (let i = 0; i < vectors.length; i += VECTORIZE_UPSERT_LIMIT) {
    await upsertVectors(params.env, rag.collection, vectors.slice(i, i + VECTORIZE_UPSERT_LIMIT));
  }

  const byId = new Map(pending.map((doc) => [doc.documentId, doc]));
  return {
    results: [...byId.keys()].map((documentId) => {
      const saved = savedByDoc.get(documentId) ?? 0;
      return { ok: saved > 0, saved, documentId, collection: rag.collection };
    }),
    usage,
  };
}

/** Embed + upsert prepared documents (internal / tests). */
export async function executeSaveRag(params: SaveRagExecuteParams): Promise<SaveRagResult> {
  const { results, usage } = await executeSaveRagMany({
    env: params.env,
    definition: params.definition,
    agentId: params.agentId,
    docs: [params.input],
    embedModel: params.embedModel,
    userDO: params.userDO,
    ownerId: params.ownerId,
    workflowId: params.workflowId,
    billing: params.billing,
  });
  const result = results[0];
  return (
    result
      ? { ...result, ...(usage ? { raw: { usage } } : {}) }
      : {
          ok: false,
          saved: 0,
          documentId: String(params.input.documentId ?? ''),
          collection: '',
        }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
}

function triggerContextForTable(ctx: NodeContext, item: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...asRecord(ctx.nodeInput),
    ...item,
  };
  const tableName = String(item.tableName ?? merged.tableName ?? '').trim();
  const schemaName = String(item.schemaName ?? merged.schemaName ?? '');
  const connection = {
    ...asRecord(merged.connection),
    ...asRecord(item.connection),
  };
  const oracle = resolveOracleConnectConfig({ ...merged, connection });
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  return {
    ...merged,
    ...item,
    tableName,
    schemaName,
    connection: oracle
      ? { ...connection, type: 'oracle', ...oracle }
      : Object.keys(connection).length
        ? connection
        : { type: String(merged.connectionType ?? '') },
    limits: {
      ...asRecord(merged.limits),
      sampleRowLimit: 3,
      sqlHistoryLimit: data.sqlHistoryLimit ?? asRecord(merged.limits).sqlHistoryLimit ?? 10,
    },
  };
}

function indexedTables(runContext: NodeOutput): Set<string> {
  return new Set(asStringArray(runContext[INDEXED_TABLES_KEY]));
}

function markIndexedTables(runContext: NodeOutput, tableNames: string[]): void {
  const next = indexedTables(runContext);
  for (const name of tableNames) next.add(name);
  runContext[INDEXED_TABLES_KEY] = [...next];
}

function pendingTableItems(ctx: NodeContext, items: Record<string, unknown>[]): Record<string, unknown>[] {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const done = indexedTables(ctx.runContext);
  return items
    .map((item) => {
      const tableName = resolvePipelineField(data.tableNameField, item, ctx.nodeInput, ['tableName']);
      if (!tableName.trim()) return null;
      return { ...item, tableName, schemaName: String(item.schemaName ?? ctx.nodeInput.schemaName ?? '') };
    })
    .filter((item): item is Record<string, unknown> => item != null)
    .filter((item) => !done.has(String(item.tableName ?? '')));
}

async function saveDocuments(ctx: NodeContext, docs: RagDocumentItem[]): Promise<SaveRagManyResult> {
  const filtered = docs.filter((doc) => String(doc.content).trim());
  if (!filtered.length) return { results: [] };
  return executeSaveRagMany({
    env: ctx.c.env,
    definition: ctx.definition,
    agentId: ctx.node.id,
    docs: filtered.map((doc) => ({
      content: doc.content,
      documentId: doc.documentId,
      source: doc.source,
      metadata: doc.metadata,
    })),
    userDO: ctx.userDO,
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
    billing: ragBillingFromNodeContext(ctx),
  });
}

/** Graph-path: introspect → LLM describe → schema + sqlexample → embed. */
export async function executeSaveRagPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const items = pipelineItems(ctx.nodeInput);
  if (!items.length) {
    throw new Error('save_rag: no table item from upstream (connect Get DB Info → Loop → Save RAG)');
  }

  const pendingTables = pendingTableItems(ctx, items);
  if (!pendingTables.length) {
    return {
      ok: true,
      saved: 0,
      items: [],
      documentIds: [],
      skipped: true,
      reason: 'no pending tables (already indexed or missing tableName)',
    };
  }

  const results: SaveRagResult[] = [];
  const usages: AiUsage[] = [];
  let llmCalls = 0;
  let enrichedColumns = 0;

  const infos = await introspectTablesInfo({
    env: ctx.c.env,
    definition: ctx.definition,
    agentId: ctx.node.id,
    triggerContext: triggerContextForTable(ctx, pendingTables[0]!),
    tables: pendingTables.map((item) => ({
      tableName: String(item.tableName ?? ''),
      schemaName: String(item.schemaName ?? ''),
    })),
  });

  for (const info of infos) {
    if (!info.columns.length) {
      throw new Error(`save_rag: table ${info.tableName} has no columns`);
    }
    const described = await describeTable(ctx, info);
    llmCalls += described.llmCalls;
    const docs = ragDocumentsFromEnrichment(info, described.enrichment);
    const batch = await saveDocuments(ctx, docs);
    results.push(...batch.results);
    if (batch.usage) usages.push(batch.usage);
    markIndexedTables(ctx.runContext, [info.tableName]);
    enrichedColumns += described.enrichment.columns.length;
  }

  const saved = results.reduce((sum, r) => sum + r.saved, 0);
  const usage = mergeAiUsage(...usages);
  return {
    ok: results.some((r) => r.ok),
    saved,
    items: results,
    documentIds: results.map((r) => r.documentId),
    collection: results[0]?.collection,
    tables: infos.map((i) => i.tableName),
    enrichedColumns,
    llmCalls,
    ...(usage ? { raw: { usage } } : {}),
  };
}
