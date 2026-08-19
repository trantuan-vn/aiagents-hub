import {
  embedText,
  matchToSnippet,
  queryCollection,
  type VectorMatch,
} from '../../../rag-vector.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';
import { resolveRagResources, toolNodeConfig } from '../shared/rag-context.js';

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
};

export type GetRagExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  input: GetRagInput;
  embedModel?: string;
  ownerId?: string;
  workflowId?: number;
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

export async function executeGetRag(params: GetRagExecuteParams): Promise<GetRagResult> {
  const { env, definition, agentId, input } = params;
  const config = toolNodeConfig(definition, agentId, 'get-rag') ?? {};
  const rag = resolveRagResources(definition, agentId, params.embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });

  const topK = input.topK ?? (Number(config.topK ?? 5) || 5);
  const namespace = input.namespace ?? String(config.namespace ?? rag.namespace);
  const docType = input.docType ?? (config.docTypeFilter ? String(config.docTypeFilter) : undefined);
  const scoreThreshold = config.scoreThreshold != null ? Number(config.scoreThreshold) : undefined;
  const includeMetadata = config.includeMetadata !== false;

  const vector = await embedText(env, input.query, rag.embedModel);
  if (!vector.length) return { snippets: [], count: 0 };

  const matches = await queryCollection(env, rag.collection, vector, {
    topK,
    namespace: namespace || undefined,
    docType,
    scoreThreshold,
  });

  const snippets = matches.map((m) => mapMatch(m, includeMetadata));
  return { snippets, count: snippets.length };
}

function queryFromInput(ctx: NodeContext): string {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const items = pipelineItems(ctx.nodeInput);
  const item = items[0] ?? ctx.nodeInput;
  const fromField = resolvePipelineField(data.queryField, item, ctx.nodeInput, [
    'query',
    'question',
    'text',
  ]);
  if (fromField.trim()) return fromField;

  const body = (ctx.nodeInput.body ?? item.body) as Record<string, unknown> | undefined;
  if (body && typeof body === 'object') {
    const q = body.question ?? body.query ?? body.text;
    if (q != null) return String(q);
  }
  return String(ctx.input ?? ctx.nodeInput.text ?? '').trim();
}

/** Graph-path execute: retrieve snippets for the current item / webhook question. */
export async function executeGetRagPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const query = queryFromInput(ctx);
  if (!query) {
    return { snippets: [], count: 0, text: '', query: '' };
  }
  const result = await executeGetRag({
    env: ctx.c.env,
    definition: ctx.definition,
    agentId: ctx.node.id,
    input: { query },
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  return {
    ...result,
    query,
    text: result.snippets.map((s) => s.text).join('\n\n'),
  };
}
