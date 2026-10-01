import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  embedTextWithUsage,
  queryCollection,
  resolveVectorizeIndex,
  VECTORIZE_ALL_METADATA_TOPK,
  type VectorMatch,
} from '../../../rag/index.js';
import { embeddingUsageOrEstimate, type AiUsage } from '../../../../../admin/service/pricing.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { pipelineItems, resolveConfiguredText } from '../shared/pipeline.js';
import {
  billRagEmbeddings,
  ragBillingFromNodeContext,
  resolveRagEmbedService,
  resolveRagResources,
  findRagToolNodeId,
  toolNodeConfig,
  type RagBilling,
  type ResolvedRagEmbed,
} from '../shared/rag-context.js';
import { resolveSqlPairEmbed } from '../save-sql-pair/resolve-embed.js';
import {
  assembleTwoPartRag,
  finalizeRetrievedGroup,
  groupDocumentIds,
  inferGroupBy,
  mergeMatches,
  chunkIdsForDocument,
  matchesFromVectorRows,
  parseSqlPairText,
  pickRelatedGroups,
  reduceSchemaText,
  resolveGroupKey,
  stitchedDocumentText,
  totalChunksForDocument,
  type ForeignKeyTarget,
  type SchemaView,
  type SqlPairView,
  type TwoPartRag,
} from './assemble.js';

const DEFAULT_SCHEMA_TOP_K = 4;
const DEFAULT_SQL_PAIR_TOP_K = 5;
const DEFAULT_SCORE_THRESHOLD = 0.25;
const MAX_TOP_K = 20;
const MAX_FK_HOPS = 4;

export type GetRagInput = {
  query: string;
  topK?: number;
  sqlPairTopK?: number;
  namespace?: string;
};

export type GetRagSnippet = {
  text: string;
  source?: string;
  documentId?: string;
  score?: number;
  docType?: 'sqlpair' | 'schema' | string;
  tableName?: string;
  schemaName?: string;
};

export type GetRagResult = TwoPartRag & {
  snippets: GetRagSnippet[];
  raw?: { usage: AiUsage };
};

export type GetRagExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  input: GetRagInput;
  embedModel?: string;
  userDO?: DurableObjectStub<UserDO>;
  ownerId?: string;
  workflowId?: number;
  billing?: RagBilling;
  /** Upstream payload — used only to resolve user-mapped Get RAG expressions. */
  triggerContext?: Record<string, unknown>;
};

/** Literal metadata key from node config, or an expression that resolves to a key name. */
export function resolveGroupByField(template: unknown, input: Record<string, unknown>): string {
  const expr = String(template ?? '').trim();
  if (!expr) return '';
  if (expr.includes('{{')) return resolveConfiguredText(expr, input, '');
  return expr;
}

/** Schema tables. Empty or invalid values use 4, capped at 20. */
export function resolveGetRagTopK(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SCHEMA_TOP_K;
  return Math.min(MAX_TOP_K, Math.floor(n));
}

/** Question–SQL pairs. Empty or invalid values use 5, capped at 20. */
export function resolveSqlPairTopK(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SQL_PAIR_TOP_K;
  return Math.min(MAX_TOP_K, Math.floor(n));
}

/** Cosine threshold. Unset values use 0.25. Explicit 0 keeps every hit. */
export function resolveScoreThreshold(raw: unknown): number {
  if (raw == null || raw === '') return DEFAULT_SCORE_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SCORE_THRESHOLD;
  return n;
}

export function matchesAboveTableThreshold(
  matches: VectorMatch[],
  groupBy: string,
  threshold: number,
): VectorMatch[] {
  if (!(threshold > 0)) return matches;
  const best = new Map<string, number>();
  for (const match of matches) {
    const key = resolveGroupKey(match, groupBy);
    best.set(key, Math.max(best.get(key) ?? 0, match.score ?? 0));
  }
  const keep = new Set(
    [...best.entries()].filter(([, score]) => score >= threshold).map(([key]) => key),
  );
  return matches.filter((match) => keep.has(resolveGroupKey(match, groupBy)));
}

const HYDRATE_PAGE = 100;

async function loadDocumentRows(
  env: Env,
  collection: string,
  documentIds: string[],
  seedMatches: VectorMatch[] = [],
): Promise<VectorMatch[]> {
  const index = resolveVectorizeIndex(env, collection);
  if (!index?.getByIds || !documentIds.length) return [];

  const ids = [
    ...new Set(
      (
        await Promise.all(
          documentIds.map((documentId) =>
            chunkIdsForDocument(documentId, totalChunksForDocument(documentId, seedMatches)),
          ),
        )
      ).flat(),
    ),
  ];
  if (!ids.length) return [];

  const rows: Array<{ id?: string; metadata?: Record<string, string>; score?: number }> = [];
  for (let i = 0; i < ids.length; i += HYDRATE_PAGE) {
    const page = ids.slice(i, i + HYDRATE_PAGE);
    try {
      rows.push(...((await index.getByIds(page)) ?? []));
    } catch (e) {
      try {
        rows.push(...((await index.getByIds(page)) ?? []));
      } catch (retryError) {
        console.warn('[get-rag] hydrate short', retryError ?? e);
      }
    }
  }
  return matchesFromVectorRows(rows);
}

function onlyDocType(matches: VectorMatch[], docType: string): VectorMatch[] {
  return matches.filter((match) => String(match.metadata?.docType ?? '') === docType);
}

function documentIdOfMatch(match: VectorMatch): string {
  return (
    String(match.metadata?.documentId ?? '').trim() ||
    String(match.id ?? '').replace(/::c(?:hunk-)?\d+$/i, '')
  );
}

function bestScore(matches: VectorMatch[]): number {
  return Math.max(...matches.map((match) => match.score ?? 0), 0);
}

function metaName(matches: VectorMatch[], key: string): string {
  return matches.map((match) => String(match.metadata?.[key] ?? '').trim()).find(Boolean) ?? '';
}

type SchemaDraft = {
  fullText: string;
  tableName: string;
  schemaName: string;
  dbId: string;
  score: number;
};

/** One query per retrieve. `docType` splits the rows afterwards, not on the request. */
async function queryScope(
  env: Env,
  collection: string,
  vector: number[],
  namespace: string | undefined,
): Promise<VectorMatch[]> {
  return queryCollection(env, collection, vector, {
    topK: VECTORIZE_ALL_METADATA_TOPK,
    namespace,
    strictNamespace: true,
  });
}

async function completeSchema(
  env: Env,
  collection: string,
  seed: VectorMatch[],
): Promise<VectorMatch[] | null> {
  if (!seed.length) return null;
  const loaded = await loadDocumentRows(env, collection, groupDocumentIds(seed), seed);
  return finalizeRetrievedGroup(mergeMatches(seed, loaded));
}

function draftFromSchema(matches: VectorMatch[]): SchemaDraft | null {
  const text = stitchedDocumentText(matches);
  if (!text.trim()) return null;
  return {
    fullText: text,
    tableName: metaName(matches, 'tableName'),
    schemaName: metaName(matches, 'schemaName'),
    dbId: metaName(matches, 'dbId'),
    score: bestScore(matches),
  };
}

async function selectSqlPairs(params: {
  env: Env;
  collection: string;
  matches: VectorMatch[];
  topK: number;
  threshold: number;
}): Promise<SqlPairView[]> {
  const byDoc = new Map<string, VectorMatch[]>();
  for (const match of onlyDocType(params.matches, 'sqlpair')) {
    const id = documentIdOfMatch(match);
    if (!id) continue;
    const list = byDoc.get(id) ?? [];
    list.push(match);
    byDoc.set(id, list);
  }

  const pairs: SqlPairView[] = [];
  for (const [documentId, chunks] of byDoc) {
    if (params.threshold > 0 && bestScore(chunks) < params.threshold) continue;
    const total = totalChunksForDocument(documentId, chunks);
    let rows = chunks;
    if (total > chunks.length) {
      const loaded = await loadDocumentRows(params.env, params.collection, [documentId], chunks);
      rows = mergeMatches(chunks, loaded);
    }
    if (total > 1 && rows.length < total) continue;
    const parsed = parseSqlPairText(stitchedDocumentText(rows));
    if (!parsed) continue;
    pairs.push({ ...parsed, score: bestScore(rows) });
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, params.topK);
}

async function selectAnchorSchemas(params: {
  env: Env;
  collection: string;
  matches: VectorMatch[];
  groupBy: string;
  topK: number;
}): Promise<SchemaDraft[]> {
  const keys = pickRelatedGroups(params.matches, params.groupBy, params.topK);
  const drafts: SchemaDraft[] = [];
  for (const key of keys) {
    const grouped = params.matches.filter((match) => resolveGroupKey(match, params.groupBy) === key);
    const finalized = await completeSchema(params.env, params.collection, grouped);
    if (!finalized?.length) continue;
    const draft = draftFromSchema(finalized);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

function sameTable(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

/** Save RAG writes this id for every schema document. */
function schemaDocumentId(dbId: string, schemaName: string, tableName: string): string {
  return `${dbId || 'db'}.${schemaName}.${tableName}.schema`;
}

/** An FK target is rarely near the question vector, so fetch its document by id. */
async function hydrateSchemaDocument(
  env: Env,
  collection: string,
  documentId: string,
): Promise<VectorMatch[] | null> {
  const index = resolveVectorizeIndex(env, collection);
  if (!index?.getByIds) return null;
  const headIds = await chunkIdsForDocument(documentId, 1);
  if (!headIds.length) return null;
  let head: VectorMatch[] = [];
  try {
    head = matchesFromVectorRows((await index.getByIds(headIds)) ?? []);
  } catch (e) {
    console.warn('[get-rag] foreign key document head failed:', e);
    return null;
  }
  if (!head.length) return null;
  const rest = await loadDocumentRows(env, collection, [documentId], head);
  return finalizeRetrievedGroup(mergeMatches(head, rest));
}

type HopTarget = ForeignKeyTarget & { dbId: string; anchorSchema: string };

async function loadForeignKeyHops(params: {
  env: Env;
  collection: string;
  schemaMatches: VectorMatch[];
  anchors: SchemaDraft[];
  question: string;
  sqls: string[];
}): Promise<SchemaDraft[]> {
  const seen = new Set(params.anchors.map((anchor) => anchor.tableName.toUpperCase()).filter(Boolean));
  const targets: HopTarget[] = [];
  for (const anchor of params.anchors) {
    const reduced = reduceSchemaText(anchor.fullText, params.question, params.sqls, {
      schemaName: anchor.schemaName,
      tableName: anchor.tableName,
    });
    for (const target of reduced.targets) {
      if (!target.tableName || seen.has(target.tableName.toUpperCase())) continue;
      seen.add(target.tableName.toUpperCase());
      targets.push({ ...target, dbId: anchor.dbId, anchorSchema: anchor.schemaName });
      if (targets.length >= MAX_FK_HOPS) break;
    }
    if (targets.length >= MAX_FK_HOPS) break;
  }

  const hops: SchemaDraft[] = [];
  for (const target of targets) {
    const schemaName = (target.schemaName || target.anchorSchema || '').trim();
    let finalized: VectorMatch[] | null = schemaName
      ? await hydrateSchemaDocument(
          params.env,
          params.collection,
          schemaDocumentId(target.dbId, schemaName, target.tableName),
        )
      : null;
    if (!finalized?.length) {
      let found = params.schemaMatches.filter((match) =>
        sameTable(String(match.metadata?.tableName ?? ''), target.tableName),
      );
      if (schemaName) {
        const scoped = found.filter((match) =>
          sameTable(String(match.metadata?.schemaName ?? ''), schemaName),
        );
        if (scoped.length) found = scoped;
      }
      if (!found.length) continue;
      finalized = await completeSchema(params.env, params.collection, found);
    }
    if (!finalized?.length) continue;
    const draft = draftFromSchema(finalized);
    if (draft) hops.push(draft);
  }
  return hops;
}

function toSchemaView(draft: SchemaDraft, question: string, sqls: string[]): SchemaView {
  const reduced = reduceSchemaText(draft.fullText, question, sqls, {
    schemaName: draft.schemaName,
    tableName: draft.tableName,
  });
  return {
    text: reduced.text,
    tableName: draft.tableName || reduced.tableName,
    schemaName: draft.schemaName || reduced.schemaName,
    score: draft.score,
  };
}

async function resolveGetRagEmbed(
  config: Record<string, unknown>,
  ragEndpoint: string | undefined,
  params: GetRagExecuteParams,
): Promise<ResolvedRagEmbed> {
  const configured = String(config.embedModel ?? '').trim();
  if (!configured) {
    return resolveRagEmbedService(
      { ...config, serviceEndpoint: ragEndpoint ?? config.serviceEndpoint },
      {
        embedModel: params.embedModel,
        userDO: params.userDO ?? params.billing?.userDO,
      },
    );
  }
  const resolved = await resolveSqlPairEmbed(
    configured,
    params.userDO ?? params.billing?.userDO,
    'get_rag',
  );
  return { model: resolved.model, service: resolved.service, endpoint: resolved.endpoint };
}

export async function executeGetRag(params: GetRagExecuteParams): Promise<GetRagResult> {
  const { env, definition, agentId, input } = params;
  const toolId = findRagToolNodeId(definition, agentId, 'get-rag');
  const config = toolNodeConfig(definition, toolId, 'get-rag') ?? toolNodeConfig(definition, agentId, 'get-rag') ?? {};
  const rag = resolveRagResources(definition, toolId, params.embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });
  const embed = await resolveGetRagEmbed(config, rag.serviceEndpoint, params);

  const topK = resolveGetRagTopK(input.topK ?? config.topK);
  const sqlPairTopK = resolveSqlPairTopK(input.sqlPairTopK ?? config.sqlPairTopK);
  const namespace = input.namespace ?? String(config.namespace ?? rag.namespace);
  const scoreThreshold = resolveScoreThreshold(config.scoreThreshold);
  const includeMetadata = config.includeMetadata !== false;
  const groupBy = resolveGroupByField(config.groupByField, params.triggerContext ?? {}) || 'tableName';

  try {
    const { vector, usage: embedUsage } = await embedTextWithUsage(env, input.query, embed.model);
    if (!vector.length) {
      return {
        sqlPairs: [],
        schemas: [],
        snippets: [],
        count: 0,
        ragText: '',
        raw: { usage: embeddingUsageOrEstimate([input.query], embedUsage) },
      };
    }
    if (rag.dimensions && vector.length !== rag.dimensions) {
      throw new Error(
        `Get RAG embedding dimensions (${vector.length}) do not match Vectorize index (${rag.dimensions})`,
      );
    }
    const usage = embeddingUsageOrEstimate([input.query], embedUsage);
    await billRagEmbeddings(embed, params.billing, [input.query], usage);

    const scopeMatches = await queryScope(env, rag.collection, vector, namespace || undefined);
    const sqlPairs = await selectSqlPairs({
      env,
      collection: rag.collection,
      matches: scopeMatches,
      topK: sqlPairTopK,
      threshold: scoreThreshold,
    });
    const schemaMatches = onlyDocType(scopeMatches, 'schema');
    const schemaAbove = matchesAboveTableThreshold(schemaMatches, groupBy, scoreThreshold);
    const anchors = schemaAbove.length
      ? await selectAnchorSchemas({
          env,
          collection: rag.collection,
          matches: schemaAbove,
          groupBy: inferGroupBy(schemaAbove, groupBy),
          topK,
        })
      : [];
    const hops = anchors.length
      ? await loadForeignKeyHops({
          env,
          collection: rag.collection,
          schemaMatches,
          anchors,
          question: input.query,
          sqls: sqlPairs.map((pair) => pair.sql),
        })
      : [];
    const sqls = sqlPairs.map((pair) => pair.sql);
    const schemas = [...anchors, ...hops].map((draft) => toSchemaView(draft, input.query, sqls));
    const assembled = assembleTwoPartRag(sqlPairs, schemas);
    const snippets = assembled.snippets.map((snippet) =>
      includeMetadata
        ? snippet
        : {
            text: snippet.text,
            score: snippet.score,
            docType: snippet.docType,
            tableName: snippet.tableName,
            schemaName: snippet.schemaName,
          },
    );
    return { ...assembled, snippets, raw: { usage } };
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).slice(0, 500);
    throw new Error(`Get RAG retrieve failed: ${message}`);
  }
}

function queryFromInput(ctx: NodeContext): string {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const items = pipelineItems(ctx.nodeInput);
  const item = items[0] ?? ctx.nodeInput;
  const merged = { ...(ctx.nodeInput as Record<string, unknown>), ...item };
  return resolveConfiguredText(data.queryField, merged, '');
}

function withRagOutput(nodeInput: NodeOutput, rag: Record<string, unknown>): NodeOutput {
  return { ...rag, ...nodeInput, ...rag };
}

/** Graph-path execute: retrieve snippets for the webhook prompt, then pass through to Agent. */
export async function executeGetRagPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const query = queryFromInput(ctx);
  if (!query) {
    return withRagOutput(ctx.nodeInput, { ragText: '', snippets: [], sqlPairs: [], schemas: [], count: 0, query: '' });
  }
  const result = await executeGetRag({
    env: ctx.c.env,
    definition: ctx.definition,
    agentId: ctx.node.id,
    input: { query },
    userDO: ctx.userDO,
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
    billing: ragBillingFromNodeContext(ctx),
    triggerContext: ctx.nodeInput as Record<string, unknown>,
  });
  return withRagOutput(ctx.nodeInput, {
    ragText: result.ragText,
    snippets: result.snippets,
    sqlPairs: result.sqlPairs,
    schemas: result.schemas,
    count: result.count,
    query,
    question: query,
    text: query,
    raw: result.raw,
  });
}

export type PrefetchedRag = {
  ragText: string;
  snippets: string[];
  query: string;
};

/**
 * When Get RAG is wired as an agent tool, resolve its Query field against the current payload and retrieve.
 * `forceQuery` is the rewritten question: it wins over the Query field so embed uses that sentence.
 */
export async function prefetchLinkedGetRag(
  ctx: NodeContext,
  agentId: string,
  queryFallback = '',
  forceQuery = '',
): Promise<PrefetchedRag> {
  const empty: PrefetchedRag = { ragText: '', snippets: [], query: '' };
  const existing = String((ctx.nodeInput as Record<string, unknown> | undefined)?.ragText ?? '').trim();
  if (existing) {
    const snippets = Array.isArray((ctx.nodeInput as Record<string, unknown>).snippets)
      ? ((ctx.nodeInput as Record<string, unknown>).snippets as unknown[])
          .map((s) => (typeof s === 'string' ? s : String((s as { text?: unknown })?.text ?? '')))
          .map((s) => s.trim())
          .filter(Boolean)
      : [existing];
    return { ragText: existing, snippets, query: queryFallback };
  }

  const config = toolNodeConfig(ctx.definition, agentId, 'get-rag');
  if (!config) return empty;

  const query =
    forceQuery.trim() ||
    resolveConfiguredText(
      config.queryField,
      (ctx.nodeInput ?? {}) as Record<string, unknown>,
      queryFallback,
    );
  if (!query) return empty;

  try {
    const result = await executeGetRag({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId,
      input: { query },
      userDO: ctx.userDO,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
      billing: ragBillingFromNodeContext(ctx),
      triggerContext: (ctx.nodeInput ?? {}) as Record<string, unknown>,
    });
    const snippets = result.snippets.map((snippet) => snippet.text).filter(Boolean);
    return { ragText: result.ragText, snippets, query };
  } catch (e) {
    console.warn('[get-rag] prefetch from Query field failed:', e);
    throw e;
  }
}
