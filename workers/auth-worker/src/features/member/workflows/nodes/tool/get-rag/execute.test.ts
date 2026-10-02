import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import {
  executeGetRag,
  executeGetRagPipeline,
  matchesAboveTableThreshold,
  prefetchLinkedGetRag,
  resolveGetRagTopK,
  resolveScoreThreshold,
  resolveSqlPairTopK,
} from './execute.js';
import { toVectorizeNativeNamespace, vectorChunkId } from '../../../rag/index.js';
import { WORKERS_AI_GATEWAY } from '../../../ai/workers-ai.js';

const billingMock = vi.hoisted(() => ({
  resolveServiceByEndpoint: vi.fn(),
  findApprovedServiceByEndpoint: vi.fn().mockResolvedValue(null),
  findApprovedServiceByModel: vi.fn().mockResolvedValue(null),
  billEmbeddingUsage: vi.fn().mockResolvedValue(0),
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
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
  beforeEach(() => {
    billingMock.resolveServiceByEndpoint.mockReset();
    billingMock.findApprovedServiceByEndpoint.mockReset().mockResolvedValue(null);
    billingMock.findApprovedServiceByModel.mockReset().mockResolvedValue(null);
    billingMock.billEmbeddingUsage.mockReset().mockResolvedValue(0);
    billingMock.ensureWalletBalance.mockReset().mockResolvedValue(undefined);
  });
  it('returns snippets from mocked vectorize', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.91,
          metadata: {
            text: 'Question: what is RAG?\n\n```sql\nSELECT 1\n```',
            source: 'doc-1',
            docType: 'sqlpair',
            documentId: 'sqlpair.abc',
            formatVersion: '2',
            chunkIndex: '0',
            totalChunks: '1',
          },
        },
      ],
    });
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          data: [[0.5, 0.6]],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 0,
            total_tokens: 8,
            neurons: 0.21,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        }),
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
    expect(result.snippets[0]?.docType).toBe('sqlpair');
    expect(result.snippets[0]?.text).toContain('what is RAG?');
    expect(result.ragText.indexOf('## Câu hỏi và SQL')).toBeLessThan(result.ragText.indexOf('## Schema liên quan'));
    expect(result.ragText).not.toContain('sqlexample');
    expect(result.raw?.usage).toMatchObject({
      prompt_tokens: 8,
      completion_tokens: 0,
      total_tokens: 8,
      neurons: 0.21,
      prompt_tokens_details: { cached_tokens: 0 },
    });
    expect(query).toHaveBeenCalledWith(
      [0.5, 0.6],
      expect.objectContaining({ topK: 20, returnMetadata: 'all', namespace: 'test-ns' }),
    );
    // Metadata filtering needs a Vectorize metadata index, so docType is split in JS.
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.every((call) => !call[1]?.filter)).toBe(true);
    expect(query.mock.calls.every((call) => call[1]?.topK === 20)).toBe(true);
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
    expect(aiRun).toHaveBeenCalledWith(
      '@cf/baai/bge-large-en-v1.5',
      { text: 'what is RAG?' },
      { gateway: WORKERS_AI_GATEWAY },
    );
  });

  it('bills embedding tokens and reports cost on the Get RAG node', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const service = {
      id: 9,
      endpoint: '/api/ai/baai/bge-m3',
      model: '@cf/baai/bge-m3',
      catalogId: 'bge-base',
      approvalStatus: 'approved',
      priceInput: 0.067,
      priceOutput: 0,
    };
    billingMock.resolveServiceByEndpoint.mockResolvedValue(service);
    billingMock.billEmbeddingUsage.mockResolvedValue(0.00001234);

    const onCost = vi.fn();
    const withService: WorkflowDefinition = {
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === 'tool_get'
          ? { ...n, data: { ...n.data, serviceEndpoint: '/api/ai/baai/bge-m3' } }
          : n,
      ),
    };

    await executeGetRag({
      env,
      definition: withService,
      agentId: 'tool_get',
      input: { query: 'what is RAG?' },
      userDO: {} as NodeContext['userDO'],
      billing: {
        env,
        bindingName: 'USER_DO',
        userDO: {} as NodeContext['userDO'],
        consumerIdentifier: 'user@example.com',
        workflowAttribution: { workflowId: 19, workflowOwnerId: 'owner-1' },
        onCost,
      },
    });

    expect(billingMock.ensureWalletBalance).toHaveBeenCalled();
    expect(billingMock.billEmbeddingUsage).toHaveBeenCalledWith(
      env,
      'USER_DO',
      expect.anything(),
      'user@example.com',
      service,
      expect.objectContaining({
        endpoint: '/api/ai/baai/bge-m3',
        promptTokens: expect.any(Number),
        workflowAttribution: { workflowId: 19, workflowOwnerId: 'owner-1' },
      }),
    );
    expect(onCost).toHaveBeenCalledWith(0.00001234);
  });

  it('bills the default BGE service when Get RAG has no serviceEndpoint', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const service = {
      id: 9,
      endpoint: '/api/ai/baai/bge-m3',
      model: '@cf/baai/bge-m3',
      approvalStatus: 'approved',
      priceInput: 0.067,
      priceOutput: 0,
    };
    billingMock.findApprovedServiceByEndpoint.mockResolvedValue(service);
    billingMock.billEmbeddingUsage.mockResolvedValue(0.000001);

    const onCost = vi.fn();
    await executeGetRag({
      env,
      definition,
      agentId: 'tool_get',
      input: { query: 'orders' },
      userDO: {} as NodeContext['userDO'],
      billing: {
        env,
        bindingName: 'USER_DO',
        userDO: {} as NodeContext['userDO'],
        consumerIdentifier: 'user@example.com',
        onCost,
      },
    });

    expect(billingMock.findApprovedServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      '/api/ai/baai/bge-m3',
    );
    expect(billingMock.billEmbeddingUsage).toHaveBeenCalled();
    expect(onCost).toHaveBeenCalledWith(0.000001);
  });

  it('uses the service and Vectorize memory connected on the Get RAG node', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const aiRun = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const env = {
      AI: { run: aiRun },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const wired: WorkflowDefinition = {
      nodes: [
        {
          id: 'tool_get',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 3 },
        },
        {
          id: 'svc_embed',
          type: 'service_node',
          position: { x: 0, y: 0 },
          data: { endpoint: 'https://ai.example/embed', serviceEndpoint: 'https://ai.example/embed' },
        },
        {
          id: 'mem_kb',
          type: 'memory_node',
          position: { x: 0, y: 0 },
          data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'rag-ns' },
        },
      ],
      edges: [
        { id: 'e-svc', source: 'svc_embed', target: 'tool_get', sourceHandle: 'service', targetHandle: 'service' },
        { id: 'e-mem', source: 'mem_kb', target: 'tool_get', sourceHandle: 'memory', targetHandle: 'memory' },
      ],
    };

    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      catalogId: 'bge-large',
      embedModel: '@cf/baai/bge-large-en-v1.5',
      approvalStatus: 'approved',
    });

    await executeGetRag({
      env,
      definition: wired,
      agentId: 'tool_get',
      input: { query: 'orders last month' },
      userDO: {} as NodeContext['userDO'],
    });

    expect(billingMock.resolveServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      'https://ai.example/embed',
    );
    expect(aiRun).toHaveBeenCalledWith(
      '@cf/baai/bge-large-en-v1.5',
      { text: 'orders last month' },
      { gateway: WORKERS_AI_GATEWAY },
    );
    expect(query).toHaveBeenCalledWith(
      [0.1, 0.2],
      expect.objectContaining({ namespace: 'rag-ns' }),
    );
  });

  it('hashes a Durable Object owner id into the Vectorize native namespace', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;
    const ownerId = 'a'.repeat(64);
    const wired: WorkflowDefinition = {
      nodes: [
        {
          id: 'tool_get',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 5 },
        },
        {
          id: 'mem_kb',
          type: 'memory_node',
          position: { x: 0, y: 0 },
          data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'wf19/nmem_kb' },
        },
      ],
      edges: [
        { id: 'e-mem', source: 'mem_kb', target: 'tool_get', sourceHandle: 'memory', targetHandle: 'memory' },
      ],
    };

    await executeGetRag({
      env,
      definition: wired,
      agentId: 'tool_get',
      input: { query: 'liet ke don hang' },
      ownerId,
      workflowId: 19,
    });

    const scope = `u${ownerId}/wf19/nmem_kb`;
    const nativeNs = await toVectorizeNativeNamespace(scope);
    expect(query).toHaveBeenCalledWith(
      [0.1, 0.2],
      expect.objectContaining({ namespace: nativeNs }),
    );
  });
});

describe('executeGetRagPipeline', () => {
  it('retrieves from the webhook prompt and keeps the original question for Agent', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.88,
          metadata: {
            text: '# PUBLIC.ORDERS\n\nĐơn hàng.\nOrders.\n\n| Column | Type | Nullable | Key | Description | Aliases |\n| ID | TEXT | NO | PK | VI: Mã. EN: Id. | |\n',
            source: 'orders.schema.md',
            docType: 'schema',
            documentId: 'db.PUBLIC.ORDERS.schema',
            tableName: 'ORDERS',
            schemaName: 'PUBLIC',
            formatVersion: '2',
            chunkIndex: '0',
            totalChunks: '1',
          },
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
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 3, queryField: '{{ $json.body.question || $json.chatInput }}' },
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('total revenue last 30 days');
    expect(out.count).toBe(1);
    expect((out.body as { question: string }).question).toBe('total revenue last 30 days');
    expect(String(out.text)).toBe('total revenue last 30 days');
    expect(String(out.ragText)).toContain('## Schema liên quan');
    expect(String(out.ragText)).toContain('PUBLIC.ORDERS');
    expect(String(out.ragText)).not.toContain('sqlexample');
  });

  it('does not use Simple Memory as the Vectorize dataset for Get RAG', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [{ score: 0.8, metadata: { text: 'CREATE TABLE ADMIN.ORDERS (ID NUMBER);', namespace: 'uu1/wf1/nmem_kb' } }],
    });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const mixed: WorkflowDefinition = {
      nodes: [
        {
          id: 'mem_simple',
          type: 'memory_node',
          position: { x: 0, y: 0 },
          data: { memoryKind: 'simple', sessionIdSource: 'from_chat_trigger' },
        },
        {
          id: 'mem_kb',
          type: 'memory_node',
          position: { x: 0, y: 0 },
          data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'wf1/nmem_kb' },
        },
        {
          id: 'agent_1',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { agentKind: 'reasoning_agent' },
        },
        {
          id: 'tool_get',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 3 },
        },
      ],
      edges: [
        { id: 'e-simple', source: 'mem_simple', target: 'agent_1', sourceHandle: 'memory', targetHandle: 'memory' },
        { id: 'e-tools', source: 'tool_get', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
      ],
    };

    await executeGetRag({
      env,
      definition: mixed,
      agentId: 'tool_get',
      input: { query: 'so du NDT' },
      ownerId: 'user-1',
      workflowId: 1,
    });

    const nativeNs = await toVectorizeNativeNamespace('uuser-1/wf1/nmem_kb');
    expect(query).toHaveBeenCalledWith(
      [0.5, 0.6],
      expect.objectContaining({ namespace: nativeNs }),
    );
  });

  it('queries the same workflow namespace Save RAG used when no memory node is attached', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [{
        score: 0.8,
        metadata: {
          text: '# ADMIN.ORDERS\n\nĐơn hàng.\nOrders.\n',
          namespace: 'uu1/wf1',
          docType: 'schema',
          tableName: 'ORDERS',
          schemaName: 'ADMIN',
          documentId: 'db.ADMIN.ORDERS.schema',
        },
      }],
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
          data: { toolKind: 'get-rag', toolName: 'get_rag', topK: 12, queryField: '{{ $json.body.question || $json.chatInput }}' },
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('list orders');
    expect(out.count).toBe(1);
    expect(query).toHaveBeenCalledWith(
      [0.5, 0.6],
      expect.objectContaining({
        topK: 20,
        returnMetadata: 'all',
        namespace: 'uu1/wf1',
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
      nodes: [{ id: 'tool_get', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-rag', queryField: '{{ $json.body }}' } }],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: 'doanh thu 30 ngay', query: {}, headers: {} },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('liet ke 20 don hang');
  });

  it('uses OR queryField when only chatInput is present', async () => {
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
          data: { toolKind: 'get-rag', queryField: '{{ $json.body.question || $json.chatInput }}' },
        },
      ],
      edges: [],
    };

    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { chatInput: 'doanh thu thang nay', query: 'doanh thu thang nay', text: 'doanh thu thang nay' },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('doanh thu thang nay');
  });

  it('falls back to chatInput when Query field only maps body.question', async () => {
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
      nodeInput: { chatInput: 'thong tin so du NDT', sessionId: 's1' },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetRagPipeline(ctx);
    expect(out.query).toBe('thong tin so du NDT');
  });
});

describe('two-part retrieve', () => {
  const ordersText = `# SALES.ORDERS

Đơn hàng.
Orders.

| Column | Type | Nullable | Key | Description | Aliases |
| ORDER_ID | NUMBER | NO | PK | VI: Mã đơn. EN: Order id. | mã đơn |
| CUSTOMER_ID | NUMBER | YES | FK → CUSTOMERS.ID | VI: Khách. EN: Customer. | khách |
| AMOUNT | NUMBER | YES |  | VI: Doanh thu thuần. EN: Net revenue. | doanh thu |
| NOTE | VARCHAR2 | YES |  | VI: Ghi chú. EN: Note. | ghi chú |
`;

  function schemaMatch(table: string, text: string, score: number) {
    return {
      score,
      metadata: {
        docType: 'schema',
        documentId: `db.SALES.${table}.schema`,
        tableName: table,
        schemaName: 'SALES',
        text,
      },
    };
  }

  it('returns sqlpair snippets before schema and ignores sqlexample', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.2,
          metadata: {
            docType: 'sqlpair',
            documentId: 'sqlpair.low',
            text: 'Question: unrelated\n\n```sql\nSELECT 1\n```',
          },
        },
        {
          score: 0.88,
          metadata: {
            docType: 'sqlpair',
            documentId: 'sqlpair.revenue',
            text: 'Question: doanh thu theo tháng\n\n```sql\nSELECT SUM(AMOUNT) FROM SALES.ORDERS\n```',
          },
        },
        schemaMatch('ORDERS', ordersText, 0.8),
        {
          score: 0.7,
          metadata: {
            docType: 'sqlexample',
            documentId: 'db.SALES.ORDERS.sqlexample',
            tableName: 'ORDERS',
            text: 'SELECT * FROM OLD_EXAMPLE',
          },
        },
      ],
    });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: { query, upsert: vi.fn() },
    } as unknown as Env;

    const result = await executeGetRag({
      env,
      definition,
      agentId: 'agent_1',
      input: { query: 'doanh thu theo tháng' },
    });

    expect(result.sqlPairs).toEqual([
      { question: 'doanh thu theo tháng', sql: 'SELECT SUM(AMOUNT) FROM SALES.ORDERS', score: 0.88 },
    ]);
    expect(result.schemas.map((schema) => schema.tableName)).toEqual(['ORDERS']);
    expect(result.snippets.map((snippet) => snippet.docType)).toEqual(['sqlpair', 'schema']);
    expect(result.ragText.indexOf('## Câu hỏi và SQL')).toBeLessThan(result.ragText.indexOf('## Schema liên quan'));
    expect(result.ragText).toContain('AMOUNT');
    expect(result.ragText).toContain('ORDER_ID');
    expect(result.ragText).not.toContain('NOTE');
    expect(result.ragText).not.toContain('OLD_EXAMPLE');
    expect(result.ragText).not.toContain('sqlexample');
    expect(query.mock.calls.every((call) => !call[1]?.filter)).toBe(true);
  });

  it('adds one foreign-key hop without using a topK slot', async () => {
    const customersText = `# SALES.CUSTOMERS

Khách hàng.
Customers.

| Column | Type | Nullable | Key | Description | Aliases |
| ID | NUMBER | NO | PK | VI: Mã khách. EN: Customer id. | |
| NAME | VARCHAR2 | YES |  | VI: Tên khách. EN: Customer name. | |
`;
    // The FK target is far from the question vector, so it is fetched by document id.
    const query = vi.fn().mockResolvedValue({
      matches: [
        schemaMatch('ORDERS', ordersText, 0.91),
        schemaMatch('PRODUCTS', '# SALES.PRODUCTS\n\nHàng.\nGoods.\n', 0.4),
      ],
    });
    const customersId = await vectorChunkId('db.SALES.CUSTOMERS.schema', 0);
    const getByIds = vi.fn().mockImplementation(async (ids: string[]) =>
      ids.includes(customersId)
        ? [
            {
              id: customersId,
              metadata: {
                ...schemaMatch('CUSTOMERS', customersText, 0.3).metadata,
                formatVersion: '2',
                chunkIndex: '0',
                totalChunks: '1',
              },
            },
          ]
        : [],
    );
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.2, 0.3]] }) },
      VECTORIZE: { query, getByIds, upsert: vi.fn() },
    } as unknown as Env;
    const wired: WorkflowDefinition = {
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === 'tool_get' ? { ...node, data: { ...node.data, topK: 1 } } : node,
      ),
    };

    const result = await executeGetRag({
      env,
      definition: wired,
      agentId: 'tool_get',
      input: { query: 'doanh thu theo tháng' },
    });

    expect(result.schemas.map((schema) => schema.tableName)).toEqual(['ORDERS', 'CUSTOMERS']);
    expect(result.ragText).toContain('### SALES.CUSTOMERS');
    expect(result.ragText).not.toContain('PRODUCTS');
    expect(result.ragText).toContain('_Không có câu hỏi tương tự._');
  });

  it('fails retrieve when the embed model dimension does not match the index', async () => {
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [] }), upsert: vi.fn() },
    } as unknown as Env;
    const wired: WorkflowDefinition = {
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === 'mem_kb' ? { ...node, data: { ...node.data, dimensions: 8 } } : node,
      ),
    };

    await expect(
      executeGetRag({
        env,
        definition: wired,
        agentId: 'agent_1',
        input: { query: 'orders' },
      }),
    ).rejects.toThrow(/dimensions/);
  });

  it('embeds with the embed model selected on the node', async () => {
    const aiRun = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const env = {
      AI: { run: aiRun },
      VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [] }), upsert: vi.fn() },
    } as unknown as Env;
    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      catalogId: 'bge-m3',
      endpoint: '/api/ai/baai/bge-m3',
      model: '@cf/baai/bge-m3',
      embedModel: '@cf/baai/bge-m3',
      approvalStatus: 'approved',
    });
    const wired: WorkflowDefinition = {
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === 'tool_get'
          ? { ...node, data: { ...node.data, embedModel: '/api/ai/baai/bge-m3' } }
          : node,
      ),
    };

    await executeGetRag({
      env,
      definition: wired,
      agentId: 'tool_get',
      input: { query: 'doanh thu' },
      userDO: {} as NodeContext['userDO'],
    });

    expect(aiRun).toHaveBeenCalledWith(
      '@cf/baai/bge-m3',
      { text: 'doanh thu' },
      { gateway: WORKERS_AI_GATEWAY },
    );
  });
});

describe('group by expression', () => {
  it('groups schema tables by a mapped metadata key and keeps topK', async () => {
    const query = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.91,
          metadata: {
            docType: 'schema',
            tableName: 'ORDERS',
            schemaName: 'SALES',
            documentId: 'db.SALES.ORDERS.schema',
            text: ['# SALES.ORDERS', '', 'Đơn hàng.', 'Orders.', ''].join('\n'),
          },
        },
        {
          score: 0.5,
          metadata: {
            docType: 'schema',
            tableName: 'PRODUCTS',
            schemaName: 'SALES',
            documentId: 'db.SALES.PRODUCTS.schema',
            text: ['# SALES.PRODUCTS', '', 'Hàng.', 'Goods.', ''].join('\n'),
          },
        },
      ],
    });
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
          data: {
            toolKind: 'get-rag',
            queryField: '{{ $json.body.question }}',
            groupByField: '{{ $json.groupKey }}',
            topK: 1,
          },
        },
      ],
      edges: [],
    };
    const ctx = {
      node: pipelineDefinition.nodes[0],
      nodeInput: { body: { question: 'orders' }, groupKey: 'tableName' },
      definition: pipelineDefinition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;
    const out = await executeGetRagPipeline(ctx);
    expect(out.count).toBe(1);
    expect(String(out.ragText)).toContain('SALES.ORDERS');
    expect(String(out.ragText)).not.toContain('PRODUCTS');
    expect(query.mock.calls.some((call) => call[1]?.filter?.source)).toBe(false);
  });
});


describe('Get RAG completeness', () => {
  it('uses 4 schema tables and 5 SQL pairs when those limits are empty', () => {
    expect(resolveGetRagTopK(undefined)).toBe(4);
    expect(resolveGetRagTopK(0)).toBe(4);
    expect(resolveGetRagTopK('nope')).toBe(4);
    expect(resolveGetRagTopK(100)).toBe(20);
    expect(resolveSqlPairTopK(undefined)).toBe(5);
    expect(resolveSqlPairTopK(100)).toBe(20);
    expect(resolveScoreThreshold(undefined)).toBe(0.25);
    expect(resolveScoreThreshold(0)).toBe(0);
  });

  it('does not drop a table when scoreThreshold is 0 and drops a table below a positive threshold', () => {
    const matches = [
      { score: 0.2, metadata: { tableName: 'ORDERS', text: 'a' } },
      { score: 0.9, metadata: { tableName: 'INVOICES', text: 'b' } },
    ];
    expect(matchesAboveTableThreshold(matches, 'tableName', 0)).toHaveLength(2);
    expect(matchesAboveTableThreshold(matches, 'tableName', 0.5).map((m) => m.metadata?.tableName)).toEqual([
      'INVOICES',
    ]);
  });

  it('drops a table when a chunk is still missing after one hydrate retry', async () => {
    const schema = {
      id: 'seed',
      score: 0.9,
      metadata: {
        formatVersion: '2',
        docType: 'schema',
        documentId: 'db.ADMIN.ORDERS.schema',
        tableName: 'ORDERS',
        schemaName: 'ADMIN',
        chunkIndex: '0',
        totalChunks: '2',
        text: 'part-0',
      },
    };
    const getByIds = vi.fn().mockResolvedValue([schema]);
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [schema] }), getByIds, upsert: vi.fn() },
    } as unknown as Env;

    const result = await executeGetRag({
      env,
      definition,
      agentId: 'agent_1',
      input: { query: 'orders' },
    });

    expect(result.count).toBe(0);
    expect(result.snippets).toEqual([]);
    expect(getByIds).toHaveBeenCalled();
  });

  it('loads 130 chunks in pages of at most 100', async () => {
    const schema = {
      id: 'seed',
      score: 0.9,
      metadata: {
        formatVersion: '2',
        docType: 'schema',
        documentId: 'db.ADMIN.ORDERS.schema',
        tableName: 'ORDERS',
        chunkIndex: '0',
        totalChunks: '130',
        text: 'part-0',
      },
    };
    const getByIds = vi.fn().mockImplementation(async (ids: string[]) => {
      expect(ids.length).toBeLessThanOrEqual(100);
      return [];
    });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [schema] }), getByIds, upsert: vi.fn() },
    } as unknown as Env;

    const result = await executeGetRag({
      env,
      definition,
      agentId: 'agent_1',
      input: { query: 'orders' },
    });

    expect(result.count).toBe(0);
    expect(getByIds.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns schema when sqlexample was not saved', async () => {
    const schema = {
      id: 'seed',
      score: 0.9,
      metadata: {
        formatVersion: '2',
        docType: 'schema',
        documentId: 'db.ADMIN.ORDERS.schema',
        tableName: 'ORDERS',
        schemaName: 'ADMIN',
        chunkIndex: '0',
        totalChunks: '1',
        text: '# ADMIN.ORDERS\n\nĐơn hàng.\nOrders.\n\n| Column | Type | Nullable | Key | Description | Aliases |\n| ID | NUMBER | NO | PK | VI: Mã. EN: Id. | |\n',
      },
    };
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] }) },
      VECTORIZE: {
        query: vi.fn().mockResolvedValue({ matches: [schema] }),
        getByIds: vi.fn().mockResolvedValue([schema]),
        upsert: vi.fn(),
      },
    } as unknown as Env;

    const result = await executeGetRag({
      env,
      definition,
      agentId: 'agent_1',
      input: { query: 'orders' },
    });

    expect(result.count).toBe(1);
    expect(result.snippets[0]?.docType).toBe('schema');
    expect(result.snippets[0]?.text).toContain('ADMIN.ORDERS');
    expect(result.snippets[0]?.text).toContain('ID');
    expect(result.ragText).not.toContain('sqlexample');
    expect(result.sqlPairs).toEqual([]);
  });

  it('propagates a retrieve error from prefetch instead of returning empty rag text', async () => {
    const env = {
      AI: { run: vi.fn().mockRejectedValue(new Error('embed down')) },
      VECTORIZE: { query: vi.fn(), upsert: vi.fn() },
    } as unknown as Env;
    const ctx = {
      node: definition.nodes[2],
      nodeInput: {},
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    await expect(prefetchLinkedGetRag(ctx, 'agent_1', 'orders')).rejects.toThrow(/Get RAG retrieve failed/);
  });

  it('embeds the forced rewritten question instead of the Query field', async () => {
    const run = vi.fn().mockResolvedValue({ data: [[0.5, 0.6]] });
    const env = {
      AI: { run },
      VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [] }), getByIds: vi.fn(), upsert: vi.fn() },
    } as unknown as Env;
    const ctx = {
      node: definition.nodes[2],
      nodeInput: { query: 'tiền bán theo tháng', chatInput: 'tiền bán theo tháng' },
      definition: {
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.id === 'tool_get'
            ? { ...node, data: { ...node.data, queryField: '{{ $json.chatInput }}' } }
            : node,
        ),
      },
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    await prefetchLinkedGetRag(ctx, 'agent_1', 'tiền bán theo tháng', 'doanh thu thuần theo tháng');

    const payload = JSON.stringify(run.mock.calls);
    expect(payload).toContain('doanh thu thuần theo tháng');
    expect(payload).not.toContain('tiền bán theo tháng');
  });
});
