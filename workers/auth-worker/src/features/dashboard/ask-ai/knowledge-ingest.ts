import openapiMd from './knowledge/openapi.md';
import codeExamplesMd from './knowledge/code-examples.md';

import { ASK_AI_GLOBAL_KB_USER_KEY, embedMessageText } from './semantic-memory';

const KV_HASH_KEY = 'ask_ai_kb_content_hash_v1';

function chunkMarkdown(text: string, maxChars: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const parts: string[] = [];
  const blocks = t.split(/\n## /);
  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    if (i > 0) block = '## ' + block;
    if (block.length <= maxChars) {
      parts.push(block);
      continue;
    }
    for (let j = 0; j < block.length; j += maxChars) {
      parts.push(block.slice(j, j + maxChars));
    }
  }
  return parts.filter((p) => p.length > 0);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type KnowledgeIngestEnv = {
  ASK_AI_VECTOR?: VectorizeIndex;
  SYSTEM_CONFIG_KV?: KVNamespace;
};

/**
 * Đồng bộ nội dung openapi.md + code-examples.md vào Vectorize khi hash thay đổi.
 * Gọi từ handler chat (best-effort, không chặn nếu lỗi).
 */
export async function ensureAskAiKnowledgeVectorized(env: KnowledgeIngestEnv, ai: Ai): Promise<void> {
  const index = env.ASK_AI_VECTOR;
  const kv = env.SYSTEM_CONFIG_KV;
  if (!index || !kv) return;

  const bundled = `${openapiMd}\n\n---\n\n${codeExamplesMd}`;
  const hash = await sha256Hex(bundled);
  const prev = await kv.get(KV_HASH_KEY);
  if (prev === hash) return;

  const chunks: { slug: string; text: string }[] = [
    ...chunkMarkdown(openapiMd, 1400).map((text, i) => ({ slug: `openapi-${i}`, text })),
    ...chunkMarkdown(codeExamplesMd, 1400).map((text, i) => ({ slug: `examples-${i}`, text })),
  ];

  const now = Date.now();
  const shortHash = hash.slice(0, 12);
  const vectors: Array<{
    id: string;
    values: number[];
    metadata: Record<string, string | number | boolean>;
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const { slug, text } = chunks[i];
    const embedding = await embedMessageText(ai, text);
    const id = `kb-${shortHash}-${slug}`;
    vectors.push({
      id,
      values: embedding,
      metadata: {
        userKey: ASK_AI_GLOBAL_KB_USER_KEY,
        text: text.slice(0, 2000),
        storedAt: now,
        importance: 0.92,
        frequency: 1,
        docSource: slug.startsWith('openapi') ? 'openapi' : 'code-examples',
      },
    });
  }

  if (vectors.length === 0) return;

  await index.insert(vectors);
  await kv.put(KV_HASH_KEY, hash);
}

/** Admin / tool: ép ingest lại (xoá hash KV rồi ghi chunk mới). */
export async function forceReindexAskAiKnowledge(env: KnowledgeIngestEnv, ai: Ai): Promise<void> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (kv) await kv.delete(KV_HASH_KEY);
  await ensureAskAiKnowledgeVectorized(env, ai);
}
