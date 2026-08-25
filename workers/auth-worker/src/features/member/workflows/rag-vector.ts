/** Shared Vectorize helpers for RAG — embed, query, upsert. */

import { normalizeVectorizeCollection, VECTORIZE_COLLECTION } from './vectorize-scope.js';

export { VECTORIZE_COLLECTION };
export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

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
  metadata?: Record<string, string>;
};

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

export async function embedText(
  env: Env,
  text: string,
  modelId = DEFAULT_EMBED_MODEL,
): Promise<number[]> {
  if (!text.trim() || !env.AI) return [];
  const [vector] = await embedTexts(env, [text], modelId);
  return vector ?? [];
}

/** Batch embed. Workers AI BGE accepts `text: string[]` — fallback to one-by-one. */
export async function embedTexts(
  env: Env,
  texts: string[],
  modelId = DEFAULT_EMBED_MODEL,
): Promise<number[][]> {
  if (!env.AI || !texts.length) return texts.map(() => []);
  const BATCH = 8;
  const out: number[][] = [];

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
      const embed = await env.AI.run(modelId as keyof AiModels, { text: payload });
      const rows = vectorsFromAiData((embed as { data?: unknown })?.data, nonempty.length);
      if (rows.length === nonempty.length && rows.every((row) => row.length)) {
        batchVectors = rows;
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
          const embed = await env.AI.run(modelId as keyof AiModels, { text: row.text });
          mapped[row.index] = vectorsFromAiData((embed as { data?: unknown })?.data, 1)[0] ?? [];
        } catch (e) {
          const message = String(e instanceof Error ? e.message : e).slice(0, 300);
          throw new Error(`embed failed: ${message}`);
        }
      }
    }
    out.push(...mapped);
  }

  return out;
}

export function buildMetadataFilter(opts: Pick<QueryCollectionOptions, 'namespace' | 'docType'>): Record<string, string> | undefined {
  const filter: Record<string, string> = {};
  if (opts.namespace) filter.namespace = opts.namespace;
  if (opts.docType) filter.docType = opts.docType;
  return Object.keys(filter).length ? filter : undefined;
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

  const topK = opts.topK ?? 5;
  const filter = buildMetadataFilter(opts);
  const base: VectorizeQueryOpts = { topK, returnMetadata: 'all' };

  let matches: VectorMatch[] = [];
  if (filter) {
    try {
      matches = await queryIndex(index, queryVector, { ...base, filter });
    } catch (e) {
      console.warn('[rag-vector] metadata filter query failed, falling back:', e);
    }
  }

  if (!matches.length) {
    try {
      const fetched = await queryIndex(index, queryVector, {
        ...base,
        topK: Math.min(50, Math.max(topK * 5, 20)),
      });
      matches = fetched.filter(
        (m) => matchesNamespace(m, opts.namespace) && matchesDocType(m, opts.docType),
      );
    } catch (e) {
      console.warn('[rag-vector] query failed:', e);
      return [];
    }
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
    const result = await index.upsert(vectors);
    return result.count ?? vectors.length;
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
