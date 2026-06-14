/** Shared Vectorize helpers for RAG — embed, query, upsert. */

export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

export type VectorMatch = {
  id?: string;
  score?: number;
  metadata?: Record<string, string>;
};

export type VectorizeBinding = {
  query: (
    vector: number[],
    opts: { topK: number; filter?: Record<string, string> },
  ) => Promise<{ matches?: VectorMatch[] }>;
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
  const fallback = (env as unknown as Record<string, unknown>).VECTORIZE as VectorizeBinding | undefined;
  const named = (env as unknown as Record<string, unknown>)[collection] as VectorizeBinding | undefined;
  return named ?? fallback;
}

export async function embedText(
  env: Env,
  text: string,
  modelId = DEFAULT_EMBED_MODEL,
): Promise<number[]> {
  if (!text.trim() || !env.AI) return [];
  const embed = await env.AI.run(modelId as keyof AiModels, { text });
  const vector = (embed as { data?: number[][] })?.data?.[0];
  return vector?.length ? vector : [];
}

export function buildMetadataFilter(opts: Pick<QueryCollectionOptions, 'namespace' | 'docType'>): Record<string, string> | undefined {
  const filter: Record<string, string> = {};
  if (opts.namespace) filter.namespace = opts.namespace;
  if (opts.docType) filter.docType = opts.docType;
  return Object.keys(filter).length ? filter : undefined;
}

export async function queryCollection(
  env: Env,
  collection: string,
  queryVector: number[],
  opts: QueryCollectionOptions = {},
): Promise<VectorMatch[]> {
  const index = resolveVectorizeIndex(env, collection);
  if (!index?.query || !queryVector.length) return [];

  const topK = opts.topK ?? 5;
  const filter = buildMetadataFilter(opts);

  try {
    const result = await index.query(queryVector, { topK, ...(filter ? { filter } : {}) });
    let matches = result.matches ?? [];
    if (opts.scoreThreshold != null) {
      matches = matches.filter((m) => (m.score ?? 0) >= opts.scoreThreshold!);
    }
    return matches;
  } catch (e) {
    console.warn('[rag-vector] query failed:', e);
    return [];
  }
}

export async function upsertVectors(
  env: Env,
  collection: string,
  vectors: VectorizeVectorRecord[],
): Promise<number> {
  const index = resolveVectorizeIndex(env, collection);
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
