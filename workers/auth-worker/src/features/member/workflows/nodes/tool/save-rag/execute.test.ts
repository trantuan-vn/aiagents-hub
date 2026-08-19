import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeContext } from '../../types.js';
import { executeSaveRagPipeline } from './execute.js';

describe('executeSaveRagPipeline', () => {
  it('embeds and upserts each loop item', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', chunkSize: 800 },
        },
      ],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [
          {
            content: 'CREATE TABLE orders (id TEXT);',
            documentId: 'db.public.orders.schema',
            source: 'orders.schema.md',
            metadata: { docType: 'schema', tableName: 'orders' },
          },
        ],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBe(1);
    expect(upsert).toHaveBeenCalled();
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.namespace).toBe('uuser-1/wf42');
    expect(vectors[0]?.metadata?.docType).toBe('schema');
  });
});

describe('n8n $json interpolation', () => {
  it('resolves {{ $json.body.question }}', () => {
    const scope = { body: { question: 'revenue last 30 days' }, $json: { body: { question: 'revenue last 30 days' } } };
    expect(interpolate('{{ $json.body.question }}', scope)).toBe('revenue last 30 days');
  });
});
