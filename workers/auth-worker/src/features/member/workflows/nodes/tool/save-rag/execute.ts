import { embedTexts, upsertVectors, type VectorizeVectorRecord, DEFAULT_EMBED_MODEL } from '../../../rag-vector.js';
import { resolveServiceByEndpoint } from '../../../billing/billing.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  resolveEmbedModelFromService,
  resolveRagResources,
  toolNodeConfig,
} from '../shared/rag-context.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { introspectTablesToRagDocuments } from '../get-db-info/execute.js';
import { resolveOracleConnectConfig } from '../get-db-info/connect-config.js';
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

const INDEXED_TABLES_KEY = '__saveRagIndexedTables';
const VECTORIZE_UPSERT_LIMIT = 1000;

function vectorId(documentId: string, index: number): string {
  const raw = `${documentId}::chunk-${index}`;
  if (raw.length <= 64) return raw;
  const suffix = `::c${index}`;
  return raw.slice(0, 64 - suffix.length) + suffix;
}

async function resolveSaveRagEmbedModel(
  config: Record<string, unknown>,
  params: Pick<SaveRagExecuteParams, 'embedModel' | 'userDO'>,
): Promise<string> {
  const serviceEndpoint = String(config.serviceEndpoint ?? '').trim();
  if (serviceEndpoint && params.userDO) {
    const service = await resolveServiceByEndpoint(params.userDO, serviceEndpoint);
    return resolveEmbedModelFromService(service);
  }
  return params.embedModel ?? DEFAULT_EMBED_MODEL;
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
}): Promise<SaveRagResult[]> {
  const config = toolNodeConfig(params.definition, params.agentId, 'save-rag') ?? {};
  const embedModel = await resolveSaveRagEmbedModel(config, params);
  const rag = resolveRagResources(params.definition, params.agentId, embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });
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
    return params.docs.map((input) => ({
      ok: false,
      saved: 0,
      documentId: String(input.documentId ?? ''),
      collection: rag.collection,
    }));
  }

  const flatTexts: string[] = [];
  const owners: Array<{ doc: Pending; chunk: { content: string; index: number } }> = [];
  for (const doc of pending) {
    for (const chunk of doc.chunks) {
      flatTexts.push(chunk.content);
      owners.push({ doc, chunk });
    }
  }

  const embeddings = await embedTexts(params.env, flatTexts, rag.embedModel);
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
  return [...byId.keys()].map((documentId) => {
    const saved = savedByDoc.get(documentId) ?? 0;
    return { ok: saved > 0, saved, documentId, collection: rag.collection };
  });
}

export async function executeSaveRag(params: SaveRagExecuteParams): Promise<SaveRagResult> {
  const [result] = await executeSaveRagMany({
    env: params.env,
    definition: params.definition,
    agentId: params.agentId,
    docs: [params.input],
    embedModel: params.embedModel,
    userDO: params.userDO,
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });
  return (
    result ?? {
      ok: false,
      saved: 0,
      documentId: String(params.input.documentId ?? ''),
      collection: '',
    }
  );
}

function isTableLoopItem(item: Record<string, unknown>): boolean {
  const tableName = String(item.tableName ?? item.table_name ?? '').trim();
  if (!tableName) return false;
  const content = String(item.content ?? item.text ?? item.ddl ?? '').trim();
  return !content;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
}

function findGetDbInfoNodeId(definition: WorkflowDefinition): string | undefined {
  return definition.nodes.find((n) => {
    if (n.type !== 'tool_node') return false;
    return String((n.data as Record<string, unknown> | undefined)?.toolKind ?? '') === 'get-db-info';
  })?.id;
}

/** Loop items are table names only; Oracle/D1 connection comes from Get DB Info / form output. */
function triggerContextForTable(ctx: NodeContext, item: Record<string, unknown>): Record<string, unknown> {
  const dbInfoId = findGetDbInfoNodeId(ctx.definition);
  const merged: Record<string, unknown> = {};
  for (const [id, out] of Object.entries(ctx.outputs)) {
    if (id === dbInfoId) continue;
    Object.assign(merged, asRecord(out));
  }
  if (dbInfoId) Object.assign(merged, asRecord(ctx.outputs[dbInfoId]));
  Object.assign(merged, asRecord(ctx.nodeInput));
  const firstPipelineItem = pipelineItems(ctx.nodeInput)[0];
  if (firstPipelineItem) Object.assign(merged, firstPipelineItem);
  Object.assign(merged, item);

  const tableName = String(item.tableName ?? item.table_name ?? merged.tableName ?? '').trim();
  const schemaName = String(item.schemaName ?? item.schema_name ?? merged.schemaName ?? '');
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

/**
 * Loop defaults to batchSize 1, so Save RAG would otherwise introspect+embed 20 times.
 * Pull remaining tables from Get DB Info and index them in this invocation.
 */
function pendingTableItems(ctx: NodeContext, items: Record<string, unknown>[]): Record<string, unknown>[] {
  const tableItems = items.filter(isTableLoopItem);
  if (!tableItems.length) return [];

  const done = indexedTables(ctx.runContext);
  const dbInfoId = findGetDbInfoNodeId(ctx.definition);
  const dbOut = asRecord(dbInfoId ? ctx.outputs[dbInfoId] : {});
  const schemaName = String(
    tableItems[0]?.schemaName ??
      tableItems[0]?.schema_name ??
      dbOut.schemaName ??
      ctx.nodeInput.schemaName ??
      '',
  );
  const listed = asStringArray(dbOut.tables);
  const fromInput = asStringArray(ctx.nodeInput.tables);
  const names = (listed.length ? listed : fromInput.length ? fromInput : null) ??
    tableItems.map((item) => String(item.tableName ?? item.table_name ?? '').trim()).filter(Boolean);

  return names.filter((tableName) => !done.has(tableName)).map((tableName) => ({ tableName, schemaName }));
}

async function saveDocuments(
  ctx: NodeContext,
  docs: Array<{ content: string; documentId: string; source: string; metadata: Record<string, string> }>,
): Promise<SaveRagResult[]> {
  const filtered = docs.filter((doc) => String(doc.content).trim());
  if (!filtered.length) return [];
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
  if (items.some(isTableLoopItem) && !pendingTables.length) {
    return {
      ok: true,
      saved: 0,
      skipped: true,
      reason: 'tables already indexed this run',
      items: [],
      documentIds: [],
    };
  }

  const results: SaveRagResult[] = [];

  if (pendingTables.length) {
    const docs = await introspectTablesToRagDocuments({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId: findGetDbInfoNodeId(ctx.definition) ?? ctx.node.id,
      triggerContext: triggerContextForTable(ctx, pendingTables[0]!),
      tables: pendingTables.map((item) => ({
        tableName: String(item.tableName ?? ''),
        schemaName: String(item.schemaName ?? ''),
      })),
    });
    results.push(...(await saveDocuments(ctx, docs)));
    markIndexedTables(
      ctx.runContext,
      pendingTables.map((item) => String(item.tableName ?? '')),
    );
  }

  const contentItems = items.filter((item) => !isTableLoopItem(item));
  const contentDocs: Array<{ content: string; documentId: string; source: string; metadata: Record<string, string> }> =
    [];
  for (const item of contentItems) {
    const content =
      resolvePipelineField(data.contentField, item, ctx.nodeInput, ['content', 'text', 'ddl']) ||
      stringifyUnknown(item.content ?? item.text ?? item);
    if (!String(content).trim()) continue;
    const documentId = resolvePipelineField(data.documentIdField, item, ctx.nodeInput, ['documentId', 'id']);
    const source = resolvePipelineField(data.sourceField, item, ctx.nodeInput, ['source']);
    contentDocs.push({
      content,
      documentId: documentId || crypto.randomUUID(),
      source: source || '',
      metadata: metadataFromItem(item),
    });
  }
  if (contentDocs.length) {
    results.push(...(await saveDocuments(ctx, contentDocs)));
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
