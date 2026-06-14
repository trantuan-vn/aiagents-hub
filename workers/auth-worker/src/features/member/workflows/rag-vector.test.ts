import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EMBED_MODEL,
  embedText,
  queryCollection,
  upsertVectors,
  buildMetadataFilter,
} from './rag-vector.js';
import { chunkText } from './nodes/tool/chunk.js';

describe('rag-vector', () => {
  it('buildMetadataFilter includes namespace and docType', () => {
    expect(buildMetadataFilter({ namespace: 'pdf-ingest', docType: 'schema' })).toEqual({
      namespace: 'pdf-ingest',
      docType: 'schema',
    });
    expect(buildMetadataFilter({})).toBeUndefined();
  });

  it('embedText returns vector from AI binding', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
      },
    } as unknown as Env;

    const vector = await embedText(env, 'hello world', DEFAULT_EMBED_MODEL);
    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(env.AI.run).toHaveBeenCalledWith(DEFAULT_EMBED_MODEL, { text: 'hello world' });
  });

  it('queryCollection queries vectorize index', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [{ score: 0.9, metadata: { text: 'snippet' } }],
    });
    const env = {
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const matches = await queryCollection(env, 'VECTORIZE', [0.1, 0.2], {
      topK: 3,
      namespace: 'kb',
    });
    expect(matches).toHaveLength(1);
    expect(query).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 3,
      filter: { namespace: 'kb' },
    });
  });

  it('upsertVectors calls index upsert', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      VECTORIZE: {
        query: vi.fn(),
        upsert,
      },
    } as unknown as Env;

    const saved = await upsertVectors(env, 'VECTORIZE', [
      { id: 'a', values: [1, 2], metadata: { text: 'a' } },
      { id: 'b', values: [3, 4], metadata: { text: 'b' } },
    ]);
    expect(saved).toBe(2);
    expect(upsert).toHaveBeenCalled();
  });
});

describe('chunkText', () => {
  it('splits long text with overlap', () => {
    const text = 'a'.repeat(1000);
    const chunks = chunkText(text, 400, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.content.length).toBeLessThanOrEqual(400);
  });
});
