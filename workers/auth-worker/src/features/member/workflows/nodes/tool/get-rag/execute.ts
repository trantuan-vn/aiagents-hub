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
} from '../shared/rag-context.js';
import {
  assembleGroupSnippet,
  chunkIdsForDocument,
  groupDocumentIds,
  inferGroupBy,
  matchesFromVectorRows,
  mergeMatches,
  pickRelatedGroups,
  resolveGroupKey,
} from './assemble.js';

/** Both Phase 2 document types must be present per table for Reasoning Agent SQL. */
const SQL_RAG_DOC_TYPES = ['schema', 'sqlexample'] as const;

export type GetRagInput = {
  query: string;
  topK?: number;
  namespace?: string;
};

export type GetRagSnippet = {
  text: string;
  source?: string;
  documentId?: string;
  score?: number;
  docType?: string;
  tableName?: string;
  schemaName?: string;
};

export type GetRagResult = {
  snippets: GetRagSnippet[];
  count: number;
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

function presentDocTypes(matches: VectorMatch[]): Set<string> {
  return new Set(matches.map((m) => String(m.metadata?.docType ?? '').trim()).filter(Boolean));
}

/** Missing schema / sqlexample for this table group. */
export function missingSqlRagDocTypes(matches: VectorMatch[]): string[] {
  const present = presentDocTypes(matches);
  return SQL_RAG_DOC_TYPES.filter((t) => !present.has(t));
}

export function groupLooksIncomplete(matches: VectorMatch[]): boolean {
  return missingSqlRagDocTypes(matches).length > 0;
}

/** Literal metadata key from node config, or an expression that resolves to a key name. */
export function resolveGroupByField(template: unknown, input: Record<string, unknown>): string {
  const expr = String(template ?? '').trim();
  if (!expr) return '';
  if (expr.includes('{{')) return resolveConfiguredText(expr, input, '');
  return expr;
}

async function loadDocumentRows(
  env: Env,
  collection: string,
  documentIds: string[],
): Promise<VectorMatch[]> {
  const index = resolveVectorizeIndex(env, collection);
  if (!index?.getByIds || !documentIds.length) return [];
  const ids = documentIds.flatMap(chunkIdsForDocument);
  try {
    const rows = await index.getByIds(ids);
    return matchesFromVectorRows(rows ?? []);
  } catch (e) {
    console.warn('[get-rag] getByIds hydrate failed:', e);
    return [];
  }
}

async function queryTypedForGroup(params: {
  env: Env;
  collection: string;
  queryVector: number[];
  namespace?: string;
  groupBy: string;
  groupValue: string;
  docType: string;
}): Promise<VectorMatch[]> {
  try {
    const filter: Record<string, string> = { docType: params.docType };
    if (params.groupBy) filter[params.groupBy] = params.groupValue;
    return await queryCollection(params.env, params.collection, params.queryVector, {
      topK: VECTORIZE_ALL_METADATA_TOPK,
      namespace: params.namespace,
      docType: params.docType,
      filter,
    });
  } catch (e) {
    console.warn(`[get-rag] typed ${params.docType} query failed:`, e);
    return [];
  }
}

async function hydrateRelatedGroups(params: {
  env: Env;
  collection: string;
  queryVector: number[];
  matches: VectorMatch[];
  namespace?: string;
  groupBy: string;
  topK: number;
  extraEmbed?: (text: string) => Promise<number[]>;
}): Promise<VectorMatch[][]> {
  const groupBy = inferGroupBy(params.matches, params.groupBy);
  const groups = pickRelatedGroups(params.matches, groupBy, params.topK);
  return Promise.all(
    groups.map(async (groupValue) => {
      let grouped = params.matches.filter((match) => resolveGroupKey(match, groupBy) === groupValue);
      try {
        const filtered = await queryCollection(params.env, params.collection, params.queryVector, {
          topK: VECTORIZE_ALL_METADATA_TOPK,
          namespace: params.namespace,
          filter: groupBy ? { [groupBy]: groupValue } : undefined,
        });
        grouped = mergeMatches(grouped, filtered);
      } catch (e) {
        console.warn('[get-rag] related-group filter query failed:', e);
      }

      grouped = mergeMatches(grouped, await loadDocumentRows(params.env, params.collection, groupDocumentIds(grouped)));

      const catalogued = grouped.some(
        (match) => match.metadata?.tableName || match.metadata?.docType || match.metadata?.schemaName,
      );

      if (catalogued && groupLooksIncomplete(grouped)) {
        for (const docType of missingSqlRagDocTypes(grouped)) {
          grouped = mergeMatches(
            grouped,
            await queryTypedForGroup({
              env: params.env,
              collection: params.collection,
              queryVector: params.queryVector,
              namespace: params.namespace,
              groupBy,
              groupValue,
              docType,
            }),
          );
        }
        grouped = mergeMatches(
          grouped,
          await loadDocumentRows(params.env, params.collection, groupDocumentIds(grouped)),
        );
      }

      if (catalogued && groupLooksIncomplete(grouped) && params.extraEmbed) {
        try {
          const namedVector = await params.extraEmbed(groupValue);
          if (namedVector.length) {
            const named = await queryCollection(params.env, params.collection, namedVector, {
              topK: VECTORIZE_ALL_METADATA_TOPK,
              namespace: params.namespace,
            });
            grouped = mergeMatches(
              grouped,
              named.filter((match) => resolveGroupKey(match, groupBy) === groupValue),
            );
            for (const docType of missingSqlRagDocTypes(grouped)) {
              grouped = mergeMatches(
                grouped,
                await queryTypedForGroup({
                  env: params.env,
                  collection: params.collection,
                  queryVector: namedVector,
                  namespace: params.namespace,
                  groupBy,
                  groupValue,
                  docType,
                }),
              );
            }
            grouped = mergeMatches(
              grouped,
              await loadDocumentRows(params.env, params.collection, groupDocumentIds(grouped)),
            );
          }
        } catch (e) {
          console.warn('[get-rag] related-group name query failed:', e);
        }
      }
      return grouped;
    }),
  );
}

/** Query both schema and sqlexample so table selection is not biased to one docType. */
async function queryBothDocTypes(
  env: Env,
  collection: string,
  vector: number[],
  opts: { topK: number; namespace?: string; scoreThreshold?: number },
): Promise<VectorMatch[]> {
  const broadTopK = Math.min(VECTORIZE_ALL_METADATA_TOPK, Math.max(opts.topK * 4, 16));
  const perTypeTopK = Math.min(VECTORIZE_ALL_METADATA_TOPK, Math.max(opts.topK * 2, 8));
  const base = {
    namespace: opts.namespace,
    scoreThreshold: opts.scoreThreshold,
  };
  const [broad, schemaMatches, sqlMatches] = await Promise.all([
    queryCollection(env, collection, vector, { ...base, topK: broadTopK }),
    queryCollection(env, collection, vector, {
      ...base,
      topK: perTypeTopK,
      docType: 'schema',
      filter: { docType: 'schema' },
    }),
    queryCollection(env, collection, vector, {
      ...base,
      topK: perTypeTopK,
      docType: 'sqlexample',
      filter: { docType: 'sqlexample' },
    }),
  ]);
  return mergeMatches(broad, schemaMatches, sqlMatches);
}

export async function executeGetRag(params: GetRagExecuteParams): Promise<GetRagResult> {
  const { env, definition, agentId, input } = params;
  const toolId = findRagToolNodeId(definition, agentId, 'get-rag');
  const config = toolNodeConfig(definition, toolId, 'get-rag') ?? toolNodeConfig(definition, agentId, 'get-rag') ?? {};
  const rag = resolveRagResources(definition, toolId, params.embedModel, {
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

  const topK = input.topK ?? (Number(config.topK ?? 12) || 12);
  const namespace = input.namespace ?? String(config.namespace ?? rag.namespace);
  const scoreThreshold = config.scoreThreshold != null ? Number(config.scoreThreshold) : undefined;
  const includeMetadata = config.includeMetadata !== false;

  try {
    const { vector, usage: embedUsage } = await embedTextWithUsage(env, input.query, embed.model);
    if (!vector.length) return { snippets: [], count: 0 };
    if (rag.dimensions && vector.length !== rag.dimensions) {
      throw new Error(
        `Get RAG embedding dimensions (${vector.length}) do not match Vectorize index (${rag.dimensions})`,
      );
    }
    const extraEmbedUsages: AiUsage[] = [];
    const extraEmbedTexts: string[] = [];
    const usage = embeddingUsageOrEstimate([input.query], embedUsage);
    await billRagEmbeddings(embed, params.billing, [input.query], usage);

    const matches = await queryBothDocTypes(env, rag.collection, vector, {
      topK,
      namespace: namespace || undefined,
      scoreThreshold,
    });

    const groupBy = resolveGroupByField(config.groupByField, params.triggerContext ?? {});
    const hydrated = matches.length
      ? await hydrateRelatedGroups({
          env,
          collection: rag.collection,
          queryVector: vector,
          matches,
          namespace: namespace || undefined,
          groupBy,
          topK,
          extraEmbed: async (text) => {
            extraEmbedTexts.push(text);
            const named = await embedTextWithUsage(env, text, embed.model);
            if (named.usage) extraEmbedUsages.push(named.usage);
            return named.vector;
          },
        })
      : [];
    if (extraEmbedTexts.length) {
      await billRagEmbeddings(
        embed,
        params.billing,
        extraEmbedTexts,
        embeddingUsageOrEstimate(extraEmbedTexts, extraEmbedUsages[0]),
      );
    }

    const inferredBy = inferGroupBy(matches, groupBy);
    const snippets = (hydrated.length ? hydrated : [matches])
      .map((group) => {
        const first = group[0];
        if (!first) return { text: '' };
        return assembleGroupSnippet(resolveGroupKey(first, inferredBy), group);
      })
      .filter((snippet) => snippet.text.trim())
      .slice(0, topK)
      .map((snippet) =>
        includeMetadata
          ? snippet
          : { text: snippet.text, score: snippet.score, tableName: snippet.tableName, schemaName: snippet.schemaName },
      );
    return { snippets, count: snippets.length, raw: { usage } };
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
    return withRagOutput(ctx.nodeInput, { ragText: '', snippets: [], count: 0, query: '' });
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
  const ragText = result.snippets.map((s) => s.text).filter(Boolean).join('\n\n');
  return withRagOutput(ctx.nodeInput, {
    ragText,
    snippets: result.snippets,
    count: result.count,
    query,
    question: query,
    text: query,
    ...result,
  });
}

export type PrefetchedRag = {
  ragText: string;
  snippets: string[];
  query: string;
};

/** When Get RAG is wired as an agent tool, resolve its Query field against the current payload and retrieve. */
export async function prefetchLinkedGetRag(
  ctx: NodeContext,
  agentId: string,
  queryFallback = '',
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

  const query = resolveConfiguredText(
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
    const snippets = result.snippets.map((s) => s.text).filter(Boolean);
    return { ragText: snippets.join('\n\n'), snippets, query };
  } catch (e) {
    console.warn('[get-rag] prefetch from Query field failed:', e);
    return empty;
  }
}
