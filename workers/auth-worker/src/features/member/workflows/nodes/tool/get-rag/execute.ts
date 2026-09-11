import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  embedTextWithUsage,
  matchToSnippet,
  queryCollection,
  VECTORIZE_ALL_METADATA_TOPK,
  type VectorMatch,
} from '../../../rag/index.js';
import { embeddingUsageOrEstimate, type AiUsage } from '../../../../../admin/service/pricing.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';
import {
  billRagEmbeddings,
  ragBillingFromNodeContext,
  resolveRagEmbedService,
  resolveRagResources,
  findRagToolNodeId,
  toolNodeConfig,
  type RagBilling,
} from '../shared/rag-context.js';

export type GetRagInput = {
  query: string;
  topK?: number;
  namespace?: string;
  docType?: string;
};

export type GetRagSnippet = {
  text: string;
  source?: string;
  documentId?: string;
  score?: number;
  docType?: string;
  tableName?: string;
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
};

function mapMatch(match: VectorMatch, includeMetadata: boolean): GetRagSnippet {
  const snippet: GetRagSnippet = { text: matchToSnippet(match), score: match.score };
  if (includeMetadata && match.metadata) {
    if (match.metadata.source) snippet.source = match.metadata.source;
    if (match.metadata.documentId) snippet.documentId = match.metadata.documentId;
    if (match.metadata.docType) snippet.docType = match.metadata.docType;
    if (match.metadata.tableName) snippet.tableName = match.metadata.tableName;
  }
  return snippet;
}

function sqlChunkScore(match: VectorMatch): number {
  const text = matchToSnippet(match);
  const docType = String(match.metadata?.docType ?? '');
  let score = 0;
  if (/CREATE TABLE|## DDL/i.test(text)) score += 4;
  if (/```sql/i.test(text)) score += 2;
  if (docType === 'sqlexample') score += 2;
  if (docType === 'schema') score += 1;
  return score;
}

function groupKey(match: VectorMatch): string {
  return String(
    match.metadata?.tableName ||
      match.metadata?.source ||
      match.metadata?.documentId ||
      match.id ||
      matchToSnippet(match).slice(0, 40),
  );
}

/** Keep one best chunk per table, preferring DDL / SQL examples over sample-row tails. */
export function preferSqlChunks(matches: VectorMatch[], topK: number): VectorMatch[] {
  const ranked = [...matches].sort(
    (a, b) => sqlChunkScore(b) - sqlChunkScore(a) || (b.score ?? 0) - (a.score ?? 0),
  );
  const byTable = new Map<string, VectorMatch>();
  for (const match of ranked) {
    const key = groupKey(match);
    if (!byTable.has(key)) byTable.set(key, match);
  }
  return [...byTable.values()].slice(0, topK);
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
  const docType = input.docType ?? (config.docTypeFilter ? String(config.docTypeFilter) : undefined);
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
    const usage = embeddingUsageOrEstimate([input.query], embedUsage);
    await billRagEmbeddings(embed, params.billing, [input.query], usage);

    const matches = await queryCollection(env, rag.collection, vector, {
      topK: Math.min(VECTORIZE_ALL_METADATA_TOPK, Math.max(topK * 4, 16)),
      namespace: namespace || undefined,
      docType,
      scoreThreshold,
    });

    const snippets = preferSqlChunks(matches, topK).map((m) => mapMatch(m, includeMetadata));
    return { snippets, count: snippets.length, raw: { usage } };
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e).slice(0, 500);
    throw new Error(`Get RAG retrieve failed: ${message}`);
  }
}

function questionFromRecord(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  const rec = value as Record<string, unknown>;
  const q = rec.question ?? rec.query ?? rec.prompt ?? rec.text ?? rec.message;
  return q != null ? String(q).trim() : '';
}

function queryFromInput(ctx: NodeContext): string {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const items = pipelineItems(ctx.nodeInput);
  const item = items[0] ?? ctx.nodeInput;

  const fromField = resolvePipelineField(data.queryField, item, ctx.nodeInput, []);
  if (fromField.trim() && fromField !== '[object Object]') return fromField.trim();

  const fromBody = questionFromRecord(ctx.nodeInput.body ?? item.body);
  if (fromBody) return fromBody;

  const fromFallback = resolvePipelineField(undefined, item, ctx.nodeInput, [
    'question',
    'prompt',
    'text',
  ]);
  if (fromFallback.trim() && fromFallback !== '[object Object]') return fromFallback.trim();

  if (typeof item.question === 'string' && item.question.trim()) return item.question.trim();

  const raw = String(ctx.input ?? '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const fromJson = questionFromRecord(parsed);
      if (fromJson) return fromJson;
    } catch {
      return raw;
    }
  }
  return '';
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
