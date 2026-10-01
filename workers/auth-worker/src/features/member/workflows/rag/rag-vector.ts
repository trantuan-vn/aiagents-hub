/** Shared Vectorize helpers for RAG — embed, query, upsert. */

import { normalizeVectorizeCollection, VECTORIZE_COLLECTION } from './vectorize-scope.js';
import {
  extractUsageFromAiResponse,
  mergeAiUsage,
  type AiUsage,
} from '../../../admin/service/pricing.js';
import {
  isAiCapacityError,
  withAiCapacityRetry,
  WORKERS_AI_GATEWAY,
} from '../ai/workers-ai.js';

/** Multilingual embeddings. 1024 dimensions — the Vectorize index must be created at 1024. */
export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-m3';
export const DEFAULT_EMBED_DIMENSIONS = 1024;
const LEGACY_ENGLISH_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

/** RAG calls use bge-m3. A service still stored as the English base model is rewritten. */
export function resolveDefaultEmbedModel(modelId: string | undefined): string {
  const id = String(modelId ?? '').trim();
  if (!id || id === LEGACY_ENGLISH_EMBED_MODEL) return DEFAULT_EMBED_MODEL;
  return id;
}

export type VectorMatch = {
  id?: string;
  score?: number;
  metadata?: Record<string, string>;
};

export type VectorizeQueryOpts = {
  topK: number;
  filter?: Record<string, string>;
  namespace?: string;
  returnMetadata?: boolean | 'all' | 'indexed' | 'none';
};

export type VectorizeBinding = {
  query: (vector: number[], opts: VectorizeQueryOpts) => Promise<{ matches?: VectorMatch[] }>;
  upsert?: (vectors: VectorizeVectorRecord[]) => Promise<{ count?: number }>;
  getByIds?: (ids: string[]) => Promise<Array<{ id?: string; metadata?: Record<string, string> }>>;
};

export type VectorizeVectorRecord = {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string>;
};

/** `returnMetadata: "all"` drops max topK from 100 to 20. */
export const VECTORIZE_ALL_METADATA_TOPK = 20;

/** Stable id shared by Save RAG and Get RAG. 64 hex characters. */
export async function vectorChunkId(documentId: string, index: number): Promise<string> {
  const payload = new TextEncoder().encode(`${documentId}\n${index}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const VECTORIZE_NAMESPACE_MAX_BYTES = 64;

export type QueryCollectionOptions = {
  topK?: number;
  namespace?: string;
  docType?: string;
  scoreThreshold?: number;
  /** Extra metadata equals-filters (e.g. tableName from Save RAG). */
  filter?: Record<string, string>;
  /**
   * When set with a namespace, an empty namespaced query stays empty.
   * Get RAG uses this so another namespace cannot replace the connected scope.
   */
  strictNamespace?: boolean;
};

export function resolveVectorizeIndex(env: Env, collection: string): VectorizeBinding | undefined {
  const normalized = normalizeVectorizeCollection(collection);
  const fallback = (env as unknown as Record<string, unknown>).VECTORIZE as VectorizeBinding | undefined;
  if (normalized === VECTORIZE_COLLECTION) return fallback;
  const named = (env as unknown as Record<string, unknown>)[normalized] as VectorizeBinding | undefined;
  return named ?? fallback;
}

async function runEmbed(env: Env, modelId: string, text: string | string[]): Promise<unknown> {
  return withAiCapacityRetry(() =>
    env.AI.run(modelId as keyof AiModels, { text }, { gateway: WORKERS_AI_GATEWAY }),
  );
}

function vectorsFromAiData(data: unknown, expected: number): number[][] {
  if (!Array.isArray(data) || !data.length) return Array.from({ length: expected }, () => []);
  if (typeof data[0] === 'number') {
    return expected === 1 ? [data as number[]] : Array.from({ length: expected }, () => []);
  }
  return Array.from({ length: expected }, (_, i) => {
    const row = data[i];
    return Array.isArray(row) && typeof row[0] === 'number' ? (row as number[]) : [];
  });
}

export type EmbedBatchResult = {
  vectors: number[][];
  usage?: AiUsage;
};

export async function embedText(
  env: Env,
  text: string,
  modelId = DEFAULT_EMBED_MODEL,
): Promise<number[]> {
  const { vector } = await embedTextWithUsage(env, text, modelId);
  return vector;
}

export async function embedTextWithUsage(
  env: Env,
  text: string,
  modelId = DEFAULT_EMBED_MODEL,
): Promise<{ vector: number[]; usage?: AiUsage }> {
  if (!text.trim() || !env.AI) return { vector: [] };
  const { vectors, usage } = await embedTextsWithUsage(env, [text], modelId);
  return { vector: vectors[0] ?? [], usage };
}

/** Batch embed. Workers AI BGE accepts `text: string[]` — fallback to one-by-one. */
export async function embedTexts(
  env: Env,
  texts: string[],
  modelId = DEFAULT_EMBED_MODEL,
): Promise<number[][]> {
  return (await embedTextsWithUsage(env, texts, modelId)).vectors;
}

export async function embedTextsWithUsage(
  env: Env,
  texts: string[],
  modelId = DEFAULT_EMBED_MODEL,
): Promise<EmbedBatchResult> {
  if (!env.AI || !texts.length) return { vectors: texts.map(() => []) };
  const BATCH = 8;
  const out: number[][] = [];
  const usages: AiUsage[] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const nonempty = slice
      .map((text, index) => ({ text, index }))
      .filter((row) => row.text.trim());
    if (!nonempty.length) {
      out.push(...slice.map(() => [] as number[]));
      continue;
    }
    const payload = nonempty.length === 1 ? nonempty[0]!.text : nonempty.map((row) => row.text);
    let batchVectors: number[][] | undefined;
    try {
      const embed = await runEmbed(env, modelId, payload);
      const rows = vectorsFromAiData((embed as { data?: unknown })?.data, nonempty.length);
      if (rows.length === nonempty.length && rows.every((row) => row.length)) {
        batchVectors = rows;
        const usage = extractUsageFromAiResponse(embed);
        if (usage) usages.push(usage);
      }
    } catch (e) {
      if (isAiCapacityError(e)) throw e;
      /* batch unsupported — fall through */
    }
    const mapped = new Array<number[]>(slice.length).fill([]);
    if (batchVectors) {
      nonempty.forEach((row, j) => {
        mapped[row.index] = batchVectors![j] ?? [];
      });
    } else {
      for (const row of nonempty) {
        try {
          const embed = await runEmbed(env, modelId, row.text);
          mapped[row.index] = vectorsFromAiData((embed as { data?: unknown })?.data, 1)[0] ?? [];
          const usage = extractUsageFromAiResponse(embed);
          if (usage) usages.push(usage);
        } catch (e) {
          const message = String(e instanceof Error ? e.message : e).slice(0, 300);
          throw new Error(`embed failed: ${message}`);
        }
      }
    }
    out.push(...mapped);
  }

  return { vectors: out, usage: mergeAiUsage(...usages) };
}

export function buildMetadataFilter(
  opts: Pick<QueryCollectionOptions, 'namespace' | 'docType' | 'filter'>,
): Record<string, string> | undefined {
  const filter: Record<string, string> = { ...(opts.filter ?? {}) };
  if (opts.namespace) filter.namespace = opts.namespace;
  if (opts.docType) filter.docType = opts.docType;
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * Vectorize native namespace is max 64 bytes. Owner DO ids are 64 hex chars, so
 * `u{ownerId}/wf{id}/n{nodeId}` must be hashed or query/upsert silently miss.
 */
export async function toVectorizeNativeNamespace(scope: string): Promise<string> {
  const trimmed = scope.trim();
  if (!trimmed) return '';
  const encoded = new TextEncoder().encode(trimmed);
  if (encoded.byteLength <= VECTORIZE_NAMESPACE_MAX_BYTES) return trimmed;
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Node config stores `wf{id}/n{nodeId}`. Runtime prefixes `u{ownerId}/`, which is
 * longer than 64 bytes and becomes a different native namespace. Rows written
 * under the node string are invisible to that hash.
 */
export function nodeNamespaceFromScope(scope: string): string {
  const match = /^u[^/]+\/(.+)$/.exec(scope.trim());
  const suffix = match?.[1]?.trim() ?? '';
  if (!suffix) return '';
  if (new TextEncoder().encode(suffix).byteLength > VECTORIZE_NAMESPACE_MAX_BYTES) return '';
  return suffix;
}

function matchesNamespace(match: VectorMatch, namespace?: string): boolean {
  if (!namespace) return true;
  return String(match.metadata?.namespace ?? '') === namespace;
}

function matchesDocType(match: VectorMatch, docType?: string): boolean {
  if (!docType) return true;
  return String(match.metadata?.docType ?? '') === docType;
}

function matchesMetaFilter(match: VectorMatch, filter?: Record<string, string>): boolean {
  if (!filter) return true;
  for (const [key, value] of Object.entries(filter)) {
    if (!value) continue;
    if (String(match.metadata?.[key] ?? '') !== value) return false;
  }
  return true;
}

async function queryIndex(
  index: VectorizeBinding,
  queryVector: number[],
  opts: VectorizeQueryOpts,
): Promise<VectorMatch[]> {
  const result = await index.query(queryVector, opts);
  return result.matches ?? [];
}

export async function queryCollection(
  env: Env,
  collection: string,
  queryVector: number[],
  opts: QueryCollectionOptions = {},
): Promise<VectorMatch[]> {
  const index = resolveVectorizeIndex(env, normalizeVectorizeCollection(collection));
  if (!index?.query || !queryVector.length) return [];

  const topK = Math.min(VECTORIZE_ALL_METADATA_TOPK, Math.max(1, opts.topK ?? 5));
  const nativeNs = await toVectorizeNativeNamespace(opts.namespace ?? '');
  const metaFilter = opts.filter && Object.keys(opts.filter).length ? opts.filter : undefined;
  /**
   * Vectorize applies `filter` through a metadata index, and a vector is only in that
   * index when it was upserted after the index existed. Sending `filter` therefore
   * returns zero matches here, so every metadata test runs on the returned rows below.
   * Namespace stays on the request: namespace filtering needs no index.
   */
  const base: VectorizeQueryOpts = { topK, returnMetadata: 'all' };

  let matches: VectorMatch[] = [];
  try {
    matches = await queryIndex(index, queryVector, {
      ...base,
      ...(nativeNs ? { namespace: nativeNs } : {}),
    });
  } catch (e) {
    console.warn('[rag-vector] namespaced query failed:', e);
  }

  // Legacy rows were written to the default namespace with metadata.namespace only.
  if (!matches.length && nativeNs && !opts.strictNamespace) {
    try {
      const fetched = await queryIndex(index, queryVector, { topK, returnMetadata: 'all' });
      matches = fetched.filter((m) => matchesNamespace(m, opts.namespace));
    } catch (e) {
      console.warn('[rag-vector] default-namespace fallback failed:', e);
    }
  }

  // Vectors saved under the memory node's own namespace (`wf{id}/n{nodeId}`).
  const nodeNamespace = nodeNamespaceFromScope(opts.namespace ?? '');
  if (!matches.length && nodeNamespace && nodeNamespace !== nativeNs) {
    try {
      matches = await queryIndex(index, queryVector, { ...base, namespace: nodeNamespace });
    } catch (e) {
      console.warn('[rag-vector] node-namespace query failed:', e);
    }
  }

  if (metaFilter) {
    matches = matches.filter((m) => matchesMetaFilter(m, metaFilter));
  }

  if (opts.docType) {
    matches = matches.filter((m) => matchesDocType(m, opts.docType));
  }

  if (opts.scoreThreshold != null && opts.scoreThreshold > 0) {
    const passed = matches.filter((m) => (m.score ?? 0) >= opts.scoreThreshold!);
    if (passed.length) matches = passed;
  }

  return matches.slice(0, topK);
}

export async function upsertVectors(
  env: Env,
  collection: string,
  vectors: VectorizeVectorRecord[],
): Promise<number> {
  const index = resolveVectorizeIndex(env, normalizeVectorizeCollection(collection));
  if (!index?.upsert || !vectors.length) return 0;
  try {
    const prepared = await Promise.all(
      vectors.map(async (vector) => {
        if (vector.namespace) return vector;
        const nativeNs = await toVectorizeNativeNamespace(String(vector.metadata?.namespace ?? ''));
        return nativeNs ? { ...vector, namespace: nativeNs } : vector;
      }),
    );
    const result = await index.upsert(prepared);
    return result.count ?? prepared.length;
  } catch (e) {
    console.warn('[rag-vector] upsert failed:', e);
    throw e;
  }
}

export function matchToSnippet(match: VectorMatch): string {
  return match.metadata?.text ?? match.metadata?.content ?? '';
}

export function matchesToSnippets(matches: VectorMatch[]): string[] {
  return matches.map(matchToSnippet).filter(Boolean);
}
