import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeContext } from '../../types.js';
import { executeSaveRag, executeSaveRagPipeline } from './execute.js';

function mockAi() {
  return {
    run: vi.fn().mockImplementation(async (_model: string, input: { text: string | string[] }) => {
      const n = Array.isArray(input.text) ? input.text.length : 1;
      return {
        data: Array.from({ length: n }, () => [0.1, 0.2]),
        usage: {
          prompt_tokens: n * 4,
          completion_tokens: 0,
          total_tokens: n * 4,
          neurons: n * 0.05,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      };
    }),
  };
}

function d1Stub(
  columns = [
    { name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
    { name: 'total', type: 'REAL', notnull: 1, dflt_value: '0', pk: 0 },
  ],
) {
  const pragma = { results: columns };
  return {
    prepare: vi.fn((sql: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => ({ results: sql.includes('SELECT *') ? [{ id: '1', total: 10 }] : [] }),
        first: async () => ({ cnt: 1 }),
      }),
      all: async () => {
        if (sql.includes('PRAGMA table_info')) return pragma;
        if (sql.includes('PRAGMA foreign_key_list')) return { results: [] };
        return { results: [] };
      },
      first: async () => ({ cnt: 1 }),
    })),
  };
}

const enrichmentJson = JSON.stringify({
  tableSummaryVi: 'Đơn hàng',
  tableSummaryEn: 'Orders',
  columns: [
    { name: 'id', descriptionVi: 'Khóa chính', descriptionEn: 'Primary key', aliasesVi: ['mã'] },
    { name: 'total', descriptionVi: 'Tổng tiền', descriptionEn: 'Total', aliasesVi: ['doanh thu'] },
  ],
  typicalQueries: [
    {
      titleVi: 'Đếm dòng',
      titleEn: 'Count rows',
      sql: 'SELECT COUNT(*) FROM public.orders',
      noteVi: 'Số lượng đơn',
    },
  ],
});

const billingMock = vi.hoisted(() => ({
  resolveServiceByEndpoint: vi.fn(),
  findApprovedServiceByEndpoint: vi.fn().mockResolvedValue(null),
  findApprovedServiceByModel: vi.fn().mockResolvedValue(null),
  billEmbeddingUsage: vi.fn().mockResolvedValue(0),
  billAgentUsage: vi.fn().mockResolvedValue(0),
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  getModelForService: vi.fn().mockReturnValue('@cf/meta/llama-3.1-8b-instruct'),
  runTextModel: vi.fn(),
  extractTextFromAiResponse: vi.fn(),
  asBillingAiResponse: (usage: unknown, text = '') => usage ?? { response: text },
}));

vi.mock('../../../billing/billing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../billing/billing.js')>();
  return { ...actual, ...billingMock };
});

function saveRagGraph(extraSaveData: Record<string, unknown> = {}): WorkflowDefinition {
  return {
    nodes: [
      {
        id: 'save',
        type: 'tool_node',
        position: { x: 0, y: 0 },
        data: {
          toolKind: 'save-rag',
          tableNameField: '{{ $json.tableName }}',
          chunkSize: 800,
          sqlHistoryLimit: 10,
          ...extraSaveData,
        },
      },
      {
        id: 'svc_embed',
        type: 'service_node',
        position: { x: 0, y: 0 },
        data: { endpoint: '/api/ai/baai/bge-base-en-v1.5' },
      },
      {
        id: 'svc_llm',
        type: 'service_node',
        position: { x: 0, y: 0 },
        data: { endpoint: '/api/ai/meta/llama-3.1-8b-instruct' },
      },
      {
        id: 'mem_kb',
        type: 'memory_node',
        position: { x: 0, y: 0 },
        data: { memoryKind: 'vectorize', collection: 'VECTORIZE', namespace: 'kb-ns' },
      },
    ],
    edges: [
      { id: 'e-svc', source: 'svc_embed', target: 'save', sourceHandle: 'service', targetHandle: 'service' },
      { id: 'e-llm', source: 'svc_llm', target: 'save', sourceHandle: 'service', targetHandle: 'llm' },
      { id: 'e-mem', source: 'mem_kb', target: 'save', sourceHandle: 'memory', targetHandle: 'memory' },
    ],
  };
}

describe('executeSaveRagPipeline', () => {
  beforeEach(() => {
    billingMock.resolveServiceByEndpoint.mockImplementation(async (_user: unknown, endpoint: string) => {
      if (String(endpoint).includes('bge') || String(endpoint).includes('embed')) {
        return {
          id: 1,
          endpoint,
          catalogId: 'bge-base',
          embedModel: '@cf/baai/bge-base-en-v1.5',
          approvalStatus: 'approved',
        };
      }
      return {
        id: 2,
        endpoint,
        catalogId: 'llama',
        model: '@cf/meta/llama-3.1-8b-instruct',
        approvalStatus: 'approved',
      };
    });
    billingMock.runTextModel.mockResolvedValue({ response: enrichmentJson });
    billingMock.extractTextFromAiResponse.mockReturnValue(enrichmentJson);
    billingMock.billEmbeddingUsage.mockResolvedValue(0);
    billingMock.billAgentUsage.mockResolvedValue(0);
    billingMock.getModelForService.mockImplementation((service: Record<string, unknown>) => {
      const id = String(service.model ?? service.embedModel ?? service.catalogId ?? '');
      if (id.includes('bge') || id.includes('embed')) return '@cf/baai/bge-base-en-v1.5';
      return '@cf/meta/llama-3.1-8b-instruct';
    });
  });

  it('introspects a loop table item then upserts schema and sqlexample docs', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition = saveRagGraph();
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [
          {
            tableName: 'orders',
            schemaName: 'public',
            dbId: 'analytics-db',
            connection: { type: 'd1' },
            limits: { sampleRowLimit: 3, sqlHistoryLimit: 10 },
          },
        ],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBeGreaterThanOrEqual(2);
    expect(billingMock.runTextModel).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    const docTypes = new Set(vectors.map((v) => v.metadata?.docType));
    expect(docTypes.has('schema')).toBe(true);
    expect(docTypes.has('sqlexample')).toBe(true);
    expect(vectors.some((v) => v.metadata?.tableName === 'orders')).toBe(true);
  });

  it('resolves D1 connection from Get DB Info output when loop item is only a table name', async () => {
    const db = d1Stub([{ name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 }]);
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition = saveRagGraph();
    billingMock.extractTextFromAiResponse.mockReturnValue(
      JSON.stringify({
        tableSummaryVi: 't',
        tableSummaryEn: 't',
        columns: [{ name: 'id', descriptionVi: 'k', descriptionEn: 'pk', aliasesVi: [] }],
        typicalQueries: [
          { titleVi: 'c', titleEn: 'c', sql: 'SELECT COUNT(*) FROM public.orders', noteVi: 'n' },
        ],
      }),
    );

    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public' }],
        schemaName: 'public',
        connection: { type: 'd1' },
        dbId: 'analytics-db',
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBeGreaterThanOrEqual(1);
  });

  it('indexes only the current loop table from INPUT', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition = saveRagGraph();
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public' }],
        schemaName: 'public',
        connection: { type: 'd1' },
        dbId: 'analytics-db',
        tables: ['orders', 'invoices'],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const first = await executeSaveRagPipeline(ctx);
    expect(first.ok).toBe(true);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    const tables = new Set(vectors.map((v) => v.metadata?.tableName));
    expect(tables).toEqual(new Set(['orders']));
  });

  it('uses embed service + llm service + Vectorize on the Save RAG node', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition = saveRagGraph();
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' }],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(billingMock.resolveServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      '/api/ai/meta/llama-3.1-8b-instruct',
    );
    expect(billingMock.resolveServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      '/api/ai/baai/bge-base-en-v1.5',
    );
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ namespace?: string; metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.namespace).toBe('uuser-1/kb-ns');
  });

  it('fails when LLM service handle is missing', async () => {
    const db = d1Stub();
    const env = { AI: mockAi(), VECTORIZE: { query: vi.fn(), upsert: vi.fn() }, D1DB: db } as unknown as Env;
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', tableNameField: '{{ $json.tableName }}' },
        },
      ],
      edges: [],
    };
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public', connection: { type: 'd1' } }],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      userDO: {},
    } as unknown as NodeContext;

    await expect(executeSaveRagPipeline(ctx)).rejects.toThrow(/LLM handle/i);
  });
});

describe('executeSaveRag (embed prepared docs)', () => {
  beforeEach(() => {
    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      id: 9,
      endpoint: '/api/ai/baai/bge-base-en-v1.5',
      model: '@cf/baai/bge-base-en-v1.5',
      catalogId: 'bge-base',
      approvalStatus: 'approved',
      priceInput: 0.067,
      priceOutput: 0,
    });
    billingMock.billEmbeddingUsage.mockResolvedValue(0.000045);
  });

  it('bills embedding tokens for prepared content', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { query: vi.fn(), upsert } } as unknown as Env;
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', serviceEndpoint: '/api/ai/baai/bge-base-en-v1.5' },
        },
      ],
      edges: [],
    };

    const onCost = vi.fn();
    const out = await executeSaveRag({
      env,
      definition,
      agentId: 'save',
      input: {
        content: 'CREATE TABLE orders (id TEXT);',
        documentId: 'db.public.orders.schema',
        source: 'orders.schema.md',
        metadata: { docType: 'schema', tableName: 'orders' },
      },
      userDO: {} as never,
      ownerId: 'user-1',
      workflowId: 42,
      billing: {
        env,
        bindingName: 'USER_DO',
        userDO: {} as never,
        consumerIdentifier: 'user@example.com',
        workflowAttribution: { workflowId: 42, workflowOwnerId: 'owner-1' },
        onCost,
      },
    });

    expect(out.ok).toBe(true);
    expect(billingMock.billEmbeddingUsage).toHaveBeenCalled();
    expect(onCost).toHaveBeenCalledWith(0.000045);
  });
});

describe('n8n $json interpolation', () => {
  it('resolves {{ $json.body.question }}', () => {
    const scope = {
      body: { question: 'revenue last 30 days' },
      $json: { body: { question: 'revenue last 30 days' } },
    };
    expect(interpolate('{{ $json.body.question }}', scope)).toBe('revenue last 30 days');
  });

  it('resolves tableName from the current loop item', () => {
    const item = { tableName: 'ORDERS', schemaName: 'ADMIN' };
    const scope = { ...item, items: [item], $json: { ...item, items: [item] } };
    expect(interpolate('{{ $json.tableName }}', scope)).toBe('ORDERS');
  });
});
