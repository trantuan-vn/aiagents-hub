import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { executeGetRag, executeGetRagPipeline } from './execute.js';

const definition: WorkflowDefinition = {
  nodes: [
    { id: 'agent_1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
    {
      id: 'mem_kb',
      type: 'memory_node',
      position: { x: 0, y: 0 },
      data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'test-ns' },
    },
    {
      id: 'tool_get',
      type: 'tool_node',
      position: { x: 0, y: 0 },
      data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 3 },
    },
  ],
  edges: [
    { id: 'e1', source: 'mem_kb', target: 'agent_1', sourceHandle: 'memory', targetHandle: 'memory' },
    { id: 'e2', source: 'tool_get', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
  ],
};

describe('executeGetRag', () => {
  it('returns snippets from mocked vectorize', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.91,
          metadata: { text: 'answer snippet', source: 'doc-1' },
        },
      ],
    });
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }),
      },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const result = await executeGetRag({
      env,
      definition,
      agentId: 'agent_1',
      input: { query: 'what is RAG?' },
    });

    expect(result.count).toBe(1);
    expect(result.snippets[0]?.text).toBe('answer snippet');
    expect(result.snippets[0]?.source).toBe('doc-1');
    expect(query).toHaveBeenCalledWith(
      [0.5, 0.6],
      expect.objectContaining({ topK: 3, filter: { namespace: 'test-ns' } }),
    );
  });
});

describe('executeGetRagPipeline', () => {
  it('retrieves from the webhook prompt and keeps the original question for Agent', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.88,
          metadata: { text: 'CREATE TABLE public.orders (id TEXT);', source: 'orders.schema.md' },
        },
      ],
    });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const pipelineDefinition: WorkflowDefinition = {
      nodes: [
        {
          id: 'tool_get',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 3 },
        },
        {
          id: 'mem_kb',
          type: 'memory_node',
          position: { x: 0, y: 0 },
          data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'test-ns' },
        },
      ],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: { question: 'total revenue last 30 days' } },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('total revenue last 30 days');
    expect(out.count).toBe(1);
    expect((out.body as { question: string }).question).toBe('total revenue last 30 days');
    expect(String(out.text)).toContain('CREATE TABLE public.orders');
  });
});
