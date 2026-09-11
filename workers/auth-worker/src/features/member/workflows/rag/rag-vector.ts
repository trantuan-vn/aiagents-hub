/** Shared Vectorize helpers for RAG — embed, query, upsert. */

import { normalizeVectorizeCollection, VECTORIZE_COLLECTION } from './vectorize-scope.js';
import {
  extractUsageFromAiResponse,
  mergeAiUsage,
  type AiUsage,
} from '../../admin/service/pricing.js';

export { VECTORIZE_COLLECTION };
export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const AI_GATEWAY_ID = 'unitoken';

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
};

export type VectorizeVectorRecord = {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string>;
};

/** `returnMetadata: "all"` drops max topK from 100 to 20. */
export const VECTORIZE_ALL_METADATA_TOPK = 20;
const VECTORIZE_NAMESPACE_MAX_BYTES = 64;

export type QueryCollectionOptions = {
  topK?: number;
  namespace?: string;
  docType?: string;
  scoreThreshold?: number;
};

export function resolveVectorizeIndex(env: Env, collection: string): VectorizeBinding | undefined {
  const normalized = normalizeVectorizeCollection(collection);
  const fallback = (env as unknown as Record<string, unknown>).VECTORIZE as VectorizeBinding | undefined;
  if (normalized === VECTORIZE_COLLECTION) return fallback;
  const named = (env as unknown as Record<string, unknown>)[normalized] as VectorizeBinding | undefined;
  return named ?? fallback;
}

async function runEmbed(env: Env, modelId: string, text: string | string[]): Promise<unknown> {
  return env.AI.run(modelId as keyof AiModels, { text }, { gateway: { id: AI_GATEWAY_ID } });
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
    } catch {
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

export function buildMetadataFilter(opts: Pick<QueryCollectionOptions, 'namespace' | 'docType'>): Record<string, string> | undefined {
  const filter: Record<string, string> = {};
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

function matchesNamespace(match: VectorMatch, namespace?: string): boolean {
  if (!namespace) return true;
  return String(match.metadata?.namespace ?? '') === namespace;
}

function matchesDocType(match: VectorMatch, docType?: string): boolean {
  if (!docType) return true;
  return String(match.metadata?.docType ?? '') === docType;
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
  if (!matches.length && nativeNs) {
    try {
      const fetched = await queryIndex(index, queryVector, base);
      matches = fetched.filter((m) => matchesNamespace(m, opts.namespace));
    } catch (e) {
      console.warn('[rag-vector] default-namespace fallback failed:', e);
    }
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
