import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { executeGetRag, executeGetRagPipeline, preferSqlChunks } from './execute.js';

const billingMock = vi.hoisted(() => ({
  resolveServiceByEndpoint: vi.fn(),
}));

vi.mock('../../../billing/billing.js', () => billingMock);

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
      expect.objectContaining({ topK: 16, returnMetadata: 'all', filter: { namespace: 'test-ns' } }),
    );
  });

  it('embeds the query with the selected service model', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const aiRun = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const env = {
      AI: { run: aiRun },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const withService: WorkflowDefinition = {
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === 'tool_get'
          ? {
              ...n,
              data: {
                ...n.data,
                serviceEndpoint: 'https://ai.example/embed',
              },
            }
          : n,
      ),
    };

    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      catalogId: 'bge-large',
      embedModel: '@cf/baai/bge-large-en-v1.5',
      approvalStatus: 'approved',
    });

    await executeGetRag({
      env,
      definition: withService,
      agentId: 'tool_get',
      input: { query: 'what is RAG?' },
      userDO: {} as NodeContext['userDO'],
    });

    expect(billingMock.resolveServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      'https://ai.example/embed',
    );
    expect(aiRun).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', { text: 'what is RAG?' });
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
    expect(String(out.text)).toBe('total revenue last 30 days');
    expect(String(out.ragText)).toContain('CREATE TABLE public.orders');
  });

  it('queries the same workflow namespace Save RAG used when no memory node is attached', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [{ score: 0.8, metadata: { text: 'CREATE TABLE ADMIN.ORDERS (ID NUMBER);', namespace: 'uu1/wf1' } }],
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
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 12 },
        },
        {
          id: 'tool_save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag' },
        },
      ],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: { question: 'list orders' }, query: {}, headers: {} },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('list orders');
    expect(out.count).toBe(1);
    expect(query).toHaveBeenCalledWith(
      [0.5, 0.6],
      expect.objectContaining({
        topK: 48,
        returnMetadata: 'all',
        filter: { namespace: 'uu1/wf1' },
      }),
    );
  });

  it('reads a plain-string webhook body as the search question', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.2, 0.3]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const pipelineDefinition: WorkflowDefinition = {
      nodes: [{ id: 'tool_get', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-rag' } }],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: 'doanh thu 30 ngay', query: {}, headers: {} },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('doanh thu 30 ngay');
  });

  it('uses queryField expression from the previous webhook node', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.2, 0.3]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const pipelineDefinition: WorkflowDefinition = {
      nodes: [
        {
          id: 'tool_get',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-rag', queryField: '{{ $json.body.question }}' },
        },
      ],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: { question: 'liet ke 20 don hang' }, headers: {}, query: {} },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('liet ke 20 don hang');
  });
});

describe('preferSqlChunks', () => {
  it('keeps the DDL chunk over a sample-row tail for the same table', () => {
    const picked = preferSqlChunks(
      [
        {
          score: 0.99,
          metadata: {
            text: '"NGAY_MO": "2026-06-24"',
            tableName: 'TAI_KHOAN_LUU_KY',
            docType: 'schema',
            source: 'ADMIN.TAI_KHOAN_LUU_KY.schema.md',
          },
        },
        {
          score: 0.7,
          metadata: {
            text: '## DDL\n```sql\nCREATE TABLE ADMIN.TAI_KHOAN_LUU_KY (SO_TK_LUU_KY VARCHAR2(20));\n```',
            tableName: 'TAI_KHOAN_LUU_KY',
            docType: 'schema',
            source: 'ADMIN.TAI_KHOAN_LUU_KY.schema.md',
          },
        },
      ],
      5,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]?.metadata?.text).toContain('CREATE TABLE');
  });
});
