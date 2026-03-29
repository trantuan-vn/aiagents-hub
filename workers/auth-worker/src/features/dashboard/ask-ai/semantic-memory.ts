import { createWorkersAI } from 'workers-ai-provider';
import { embed } from 'ai';

/** BGE base en — 768 dims (must match Vectorize index). */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

/** Decay λ in e^(-λ·age_seconds); ~0.5 day “half relevance” at this scale. */
export const RECENCY_LAMBDA = 1.6e-5;

/** MemGPT-style: store salient facts; combined score floor (tuned for 0–1 importance). */
export const SEMANTIC_STORE_MIN_SCORE = 0.14;

/** Strong single-signal memories (preferences, IDs) — always eligible if above this importance. */
export const SEMANTIC_STORE_IMPORTANCE_FLOOR = 0.72;

/** Metadata `userKey` cho chunk tài liệu OpenAPI / code examples (vector dùng chung). */
export const ASK_AI_GLOBAL_KB_USER_KEY = '__ask_ai_kb__';

/** Similarity threshold to count “same topic” for frequency. */
const SIMILARITY_FREQ_THRESHOLD = 0.82;

export async function embedMessageText(ai: Ai, text: string): Promise<number[]> {
  const workersai = createWorkersAI({ binding: ai, gateway: { id: 'unitoken' } });
  const model = workersai.textEmbedding(EMBEDDING_MODEL);
  const { embedding } = await embed({
    model,
    value: text.slice(0, 8000),
  });
  return embedding;
}

export function recencyScore(storedAtMs: number, nowMs: number): number {
  const ageSec = Math.max(0, (nowMs - storedAtMs) / 1000);
  return Math.exp(-RECENCY_LAMBDA * ageSec);
}

export function combinedRetrievalScore(
  importance: number,
  storedAtMs: number,
  frequency: number,
  nowMs: number,
): number {
  const r = recencyScore(storedAtMs, nowMs);
  const f = Math.max(1, frequency);
  return importance * r * f;
}

export type VectorizeEnv = { ASK_AI_VECTOR?: VectorizeIndex };

export async function querySemanticForPrompt(
  env: VectorizeEnv,
  userKey: string,
  embedding: number[],
  nowMs: number,
): Promise<string> {
  const index = env.ASK_AI_VECTOR;
  if (!index) return '';

  const [userRes, kbRes] = await Promise.all([
    index.query(embedding, {
      topK: 8,
      returnMetadata: true,
      filter: { userKey: { $eq: userKey } },
    }),
    index.query(embedding, {
      topK: 8,
      returnMetadata: true,
      filter: { userKey: { $eq: ASK_AI_GLOBAL_KB_USER_KEY } },
    }),
  ]);

  type MatchLine = { score: number; line: string; kind: 'user' | 'kb' };
  const out: MatchLine[] = [];

  const pushMatches = (matches: typeof userRes.matches, kind: 'user' | 'kb') => {
    for (const m of matches ?? []) {
      const meta = m.metadata as Record<string, string | number | boolean> | undefined;
      if (!meta?.text) continue;
      const storedAt = Number(meta.storedAt ?? nowMs);
      const importance = Number(meta.importance ?? 0.5);
      const frequency = Number(meta.frequency ?? 1);
      const score = combinedRetrievalScore(importance, storedAt, frequency, nowMs);
      const vecScore = typeof m.score === 'number' ? m.score : 0;
      const blended = score * (0.6 + 0.4 * vecScore);
      if (blended < 0.015) continue;
      const prefix = kind === 'kb' ? 'KB' : 'Mem';
      const doc = meta.docSource != null ? ` [${String(meta.docSource)}]` : '';
      out.push({
        score: blended,
        line: `- (${prefix}${doc}) (${blended.toFixed(2)}) ${String(meta.text).slice(0, 500)}`,
        kind,
      });
    }
  };

  pushMatches(userRes.matches, 'user');
  pushMatches(kbRes.matches, 'kb');

  out.sort((a, b) => b.score - a.score);
  const lines = out.slice(0, 14).map((x) => x.line);
  if (lines.length === 0) return '';
  return ['## Bộ nhớ ngữ nghĩa (cá nhân + tài liệu API)', ...lines].join('\n');
}

export async function countSimilarMessages(
  env: VectorizeEnv,
  userKey: string,
  embedding: number[],
): Promise<number> {
  const index = env.ASK_AI_VECTOR;
  if (!index) return 0;
  const res = await index.query(embedding, {
    topK: 24,
    returnMetadata: true,
    filter: { userKey: { $eq: userKey } },
  });
  let n = 0;
  for (const m of res.matches ?? []) {
    if ((m.score ?? 0) >= SIMILARITY_FREQ_THRESHOLD) n += 1;
  }
  return n;
}

export async function upsertSemanticIfWorthy(params: {
  env: VectorizeEnv;
  ai: Ai;
  userKey: string;
  messageText: string;
  importance: number;
  embedding: number[];
}): Promise<void> {
  const { env, userKey, messageText, importance, embedding } = params;
  const index = env.ASK_AI_VECTOR;
  if (!index) return;

  const now = Date.now();
  const similarCount = await countSimilarMessages(env, userKey, embedding);
  const frequency = 1 + similarCount;
  const recencyAtInsert = 1;
  const rawScore = importance * recencyAtInsert * frequency;

  const shouldStore =
    importance >= SEMANTIC_STORE_IMPORTANCE_FLOOR || rawScore >= SEMANTIC_STORE_MIN_SCORE;

  if (!shouldStore) return;

  const id = crypto.randomUUID();
  await index.insert([
    {
      id,
      values: embedding,
      metadata: {
        userKey,
        text: messageText.slice(0, 2000),
        storedAt: now,
        importance,
        frequency,
      },
    },
  ]);
  // Giới hạn mềm MAX_VECTORS_PER_USER: Vectorize không hỗ trợ list theo user;
  // có thể bổ sung job dọn định kỳ hoặc upsert có chọn lọc nếu cần.
}
