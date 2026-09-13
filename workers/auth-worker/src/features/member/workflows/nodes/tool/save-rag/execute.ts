import { embedTextsWithUsage, upsertVectors, type VectorizeVectorRecord } from '../../../rag/index.js';
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
import { introspectTablesToRagDocuments } from '../get-db-info/execute.js';
import { resolveOracleConnectConfig } from '../get-db-info/connect-config.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';
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

function vectorId(documentId: string, index: number): string {
  const raw = `${documentId}::chunk-${index}`;
  if (raw.length <= 64) return raw;
  const suffix = `::c${index}`;
  return raw.slice(0, 64 - suffix.length) + suffix;
}

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
  const config = toolNodeConfig(params.definition, toolId, 'save-rag') ?? toolNodeConfig(params.definition, params.agentId, 'save-rag') ?? {};
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
  const chunkSize = Number(config.chunkSize ?? 800) || 800;
  const chunkOverlap = Number(config.chunkOverlap ?? 120) || 120;

  type Pending = {
    documentId: string;
    source: string;
    metadata: Record<string, string>;
    chunks: Array<{ content: string; index: number }>;
  };

  const pending: Pending[] = [];
  for (const input of params.docs) {
    const content = String(input.content ?? '').trim();
    const chunks =
      input.chunks?.length
        ? input.chunks.map((c) => ({ content: c.content, index: c.index }))
        : chunkText(content, chunkSize, chunkOverlap);
    if (!chunks.length) continue;
    const documentId = String(input.documentId ?? crypto.randomUUID());
    pending.push({
      documentId,
      source: String(input.source ?? input.metadata?.source ?? documentId),
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
  const billedTexts = flatTexts.filter((text, i) => (embeddings[i] ?? []).length > 0 && text.trim());
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

  for (let i = 0; i < owners.length; i++) {
    const values = embeddings[i] ?? [];
    if (!values.length) continue;
    const { doc, chunk } = owners[i]!;
    const namespace = rag.namespace || doc.metadata.namespace || '';
    vectors.push({
      id: vectorId(doc.documentId, chunk.index),
      values,
      metadata: {
        text: chunk.content,
        content: chunk.content,
        source: doc.source,
        documentId: doc.documentId,
        chunkIndex: String(chunk.index),
        ...(namespace ? { namespace } : {}),
        ...doc.metadata,
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

/** Loop output (current item + forwarded predecessor fields) is the only input. */
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
  };
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
      const content = resolvePipelineField(data.contentField, item, ctx.nodeInput, []);
      if (String(content).trim()) return null;
      const tableName = resolvePipelineField(data.tableNameField, item, ctx.nodeInput, []);
      if (!tableName.trim()) return null;
      return { ...item, tableName, schemaName: String(item.schemaName ?? ctx.nodeInput.schemaName ?? '') };
    })
    .filter((item): item is Record<string, unknown> => item != null)
    .filter((item) => !done.has(String(item.tableName ?? '')));
}

async function saveDocuments(
  ctx: NodeContext,
  docs: Array<{ content: string; documentId: string; source: string; metadata: Record<string, string> }>,
): Promise<SaveRagManyResult> {
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

/** Graph-path execute (loop table / pipeline_auto): chunk + embed + upsert. */
export async function executeSaveRagPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const items = pipelineItems(ctx.nodeInput);
  if (!items.length) {
    throw new Error('save_rag: no content to save (upstream item is empty)');
  }

  const pendingTables = pendingTableItems(ctx, items);
  const tableNameSet = new Set(pendingTables.map((item) => String(item.tableName ?? '')));

  const results: SaveRagResult[] = [];
  const usages: AiUsage[] = [];

  if (pendingTables.length) {
    const docs = await introspectTablesToRagDocuments({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId: ctx.node.id,
      triggerContext: triggerContextForTable(ctx, pendingTables[0]!),
      tables: pendingTables.map((item) => ({
        tableName: String(item.tableName ?? ''),
        schemaName: String(item.schemaName ?? ''),
      })),
    });
    const batch = await saveDocuments(ctx, docs);
    results.push(...batch.results);
    if (batch.usage) usages.push(batch.usage);
    markIndexedTables(
      ctx.runContext,
      pendingTables.map((item) => String(item.tableName ?? '')),
    );
  }

  const contentDocs: Array<{ content: string; documentId: string; source: string; metadata: Record<string, string> }> =
    [];
  for (const item of items) {
    const tableName = resolvePipelineField(data.tableNameField, item, ctx.nodeInput, []);
    if (tableNameSet.has(tableName) || indexedTables(ctx.runContext).has(tableName)) continue;
    const content = resolvePipelineField(data.contentField, item, ctx.nodeInput, []);
    if (!String(content).trim()) continue;
    const documentId = resolvePipelineField(data.documentIdField, item, ctx.nodeInput, []);
    const source = resolvePipelineField(data.sourceField, item, ctx.nodeInput, []);
    contentDocs.push({
      content,
      documentId: documentId || crypto.randomUUID(),
      source: source || '',
      metadata: metadataFromItem(item),
    });
  }
  if (contentDocs.length) {
    const batch = await saveDocuments(ctx, contentDocs);
    results.push(...batch.results);
    if (batch.usage) usages.push(batch.usage);
  }

  const saved = results.reduce((sum, r) => sum + r.saved, 0);
  const usage = mergeAiUsage(...usages);
  return {
    ok: results.some((r) => r.ok),
    saved,
    items: results,
    documentIds: results.map((r) => r.documentId),
    collection: results[0]?.collection,
    ...(usage ? { raw: { usage } } : {}),
  };
}
