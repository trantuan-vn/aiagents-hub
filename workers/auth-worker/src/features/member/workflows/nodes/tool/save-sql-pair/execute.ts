import { stampFromNode } from '../../../ai/workers-ai.js';
import { embedTextsWithUsage, upsertVectors, vectorChunkId, type VectorizeVectorRecord } from '../../../rag/index.js';
import { embeddingUsageOrEstimate } from '../../../../../admin/service/pricing.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import { pipelineItems, resolveFieldOrLiteral } from '../shared/pipeline.js';
import {
  billRagEmbeddings,
  ragBillingFromNodeContext,
  resolveRagResources,
} from '../shared/rag-context.js';
import { resolveSqlPairEmbed } from './resolve-embed.js';
import { rewriteSqlPairQuestion } from './rewrite-question.js';

const VECTORIZE_UPSERT_LIMIT = 1000;

export type SaveSqlPairResult = {
  ok: boolean;
  saved: number;
  documentId: string;
  collection: string;
};

/** Chunk body Get RAG reads back. The vector itself is only the question. */
export function sqlPairChunkText(question: string, sql: string): string {
  return `Question: ${question.trim()}\n\n\`\`\`sql\n${sql.trim()}\n\`\`\``;
}

/** Stable id: saving the same trimmed question overwrites the previous pair. */
export async function sqlPairDocumentId(question: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(question.trim()));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sqlpair.${hex}`;
}

function pairFromItem(
  data: Record<string, unknown>,
  item: Record<string, unknown>,
  nodeInput: NodeOutput,
): { question: string; sql: string } {
  const merged = { ...(nodeInput as Record<string, unknown>), ...item };
  const question = resolveFieldOrLiteral(data.questionField ?? '{{ $json.question }}', merged).trim();
  const sql = resolveFieldOrLiteral(data.sqlField ?? '{{ $json.sql }}', merged).trim();
  if (!question || !sql) {
    throw new Error('save_sql_pair: question and SQL are required');
  }
  return { question, sql };
}

/** Graph-path: one upstream item, one question–SQL pair. No Oracle. */
export async function executeSaveSqlPairPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const items = pipelineItems(ctx.nodeInput);
  if (!items.length) throw new Error('save_sql_pair: no item from upstream');

  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const pairs = items.map((item) => pairFromItem(data, item, ctx.nodeInput));
  const prepared: Array<{ original: string; question: string; sql: string }> = [];
  let llmCalls = 0;
  for (const pair of pairs) {
    const rewritten = await rewriteSqlPairQuestion(ctx, pair.question, pair.sql);
    llmCalls += rewritten.llmCalls;
    prepared.push({ original: pair.question, question: rewritten.question, sql: pair.sql });
  }

  const rag = resolveRagResources(ctx.definition, ctx.node.id, undefined, {
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  const embed = await resolveSqlPairEmbed(data.embedModel, ctx.userDO ?? ragBillingFromNodeContext(ctx)?.userDO);
  const questions = prepared.map((pair) => pair.question);
  const { vectors: embeddings, usage: embedUsage } = await embedTextsWithUsage(
    ctx.c.env,
    questions,
    embed.model,
    stampFromNode(ctx, 'embed'),
  );
  if (embeddings.some((values) => !values.length)) {
    throw new Error('save_sql_pair: empty embedding; pair was not saved');
  }
  const usage = embeddingUsageOrEstimate(questions, embedUsage);
  await billRagEmbeddings(embed, ragBillingFromNodeContext(ctx), questions, usage);
  if (rag.dimensions) {
    const mismatch = embeddings.find((values) => values.length > 0 && values.length !== rag.dimensions);
    if (mismatch) {
      throw new Error(
        `save_sql_pair: embedding dimensions (${mismatch.length}) do not match Vectorize index (${rag.dimensions})`,
      );
    }
  }

  const vectors: VectorizeVectorRecord[] = [];
  const results: SaveSqlPairResult[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const pair = prepared[i]!;
    const documentId = await sqlPairDocumentId(pair.original);
    const text = sqlPairChunkText(pair.question, pair.sql);
    const namespace = rag.namespace || '';
    vectors.push({
      id: await vectorChunkId(documentId, 0),
      values: embeddings[i] ?? [],
      metadata: {
        text,
        source: documentId,
        documentId,
        chunkIndex: '0',
        totalChunks: '1',
        docType: 'sqlpair',
        formatVersion: '2',
        embedModel: embed.catalogId,
        ...(namespace ? { namespace } : {}),
      },
    });
    results.push({ ok: true, saved: 1, documentId, collection: rag.collection });
  }

  for (let i = 0; i < vectors.length; i += VECTORIZE_UPSERT_LIMIT) {
    const wrote = await upsertVectors(ctx.c.env, rag.collection, vectors.slice(i, i + VECTORIZE_UPSERT_LIMIT));
    if (wrote <= 0) throw new Error('save_sql_pair: vector upsert failed');
  }

  const saved = results.reduce((sum, row) => sum + row.saved, 0);
  return {
    ok: saved > 0,
    saved,
    documentId: results[0]?.documentId ?? '',
    collection: rag.collection,
    items: results,
    llmCalls,
    ...(usage ? { raw: { usage } } : {}),
  };
}
