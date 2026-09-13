import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeContext } from '../../types.js';
import { executeSaveRagPipeline } from './execute.js';

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

function d1Stub(columns = [
  { name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
  { name: 'total', type: 'REAL', notnull: 1, dflt_value: '0', pk: 0 },
]) {
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

const billingMock = vi.hoisted(() => ({
  resolveServiceByEndpoint: vi.fn(),
  findApprovedServiceByEndpoint: vi.fn().mockResolvedValue(null),
  findApprovedServiceByModel: vi.fn().mockResolvedValue(null),
  billEmbeddingUsage: vi.fn().mockResolvedValue(0),
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../billing/billing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../billing/billing.js')>();
  return { ...actual, ...billingMock };
});

describe('executeSaveRagPipeline', () => {
  it('embeds and upserts each loop item', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', chunkSize: 800, contentField: '{{ $json.content }}' },
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
    expect(out.raw).toMatchObject({
      usage: {
        prompt_tokens: expect.any(Number),
        completion_tokens: 0,
        total_tokens: expect.any(Number),
        neurons: expect.any(Number),
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });
    expect(upsert).toHaveBeenCalled();
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ namespace?: string; metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.namespace).toBe('uuser-1/wf42');
    expect(vectors[0]?.namespace).toBe('uuser-1/wf42');
    expect(vectors[0]?.metadata?.docType).toBe('schema');
  });

  it('introspects a loop table item then upserts schema and sqlexample docs', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        { id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag', chunkSize: 800, tableNameField: '{{ $json.tableName }}' } },
      ],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[1],
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
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    expect(vectors.map((v) => v.metadata?.docType)).toEqual(['schema', 'sqlexample']);
    expect(vectors[0]?.metadata?.tableName).toBe('orders');
  });

  it('resolves D1 connection from Get DB Info output when loop item is only a table name', async () => {
    const db = d1Stub([{ name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 }]);
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        { id: 'form', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'form' } },
        { id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag', tableNameField: '{{ $json.tableName }}' } },
      ],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[2],
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
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBe(2);
  });

  it('indexes only the current loop table from INPUT', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        { id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag', tableNameField: '{{ $json.tableName }}' } },
      ],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[1],
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
    } as unknown as NodeContext;

    const first = await executeSaveRagPipeline(ctx);
    expect(first.ok).toBe(true);
    expect(first.saved).toBe(2);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    const tables = new Set(vectors.map((v) => v.metadata?.tableName));
    expect(tables).toEqual(new Set(['orders']));
  });

  it('bills embedding tokens and reports cost on the Save RAG node', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;

    const service = {
      id: 9,
      endpoint: '/api/ai/baai/bge-base-en-v1.5',
      model: '@cf/baai/bge-base-en-v1.5',
      catalogId: 'bge-base',
      approvalStatus: 'approved',
      priceInput: 0.067,
      priceOutput: 0,
    };
    billingMock.resolveServiceByEndpoint.mockResolvedValue(service);
    billingMock.billEmbeddingUsage.mockResolvedValue(0.000045);

    const onCost = vi.fn();
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: {
            toolKind: 'save-rag',
            chunkSize: 800,
            serviceEndpoint: '/api/ai/baai/bge-base-en-v1.5',
            contentField: '{{ $json.content }}',
          },
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
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
      attr: { workflowId: 42, workflowOwnerId: 'owner-1' },
      onCost,
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(billingMock.billEmbeddingUsage).toHaveBeenCalledWith(
      env,
      'USER_DO',
      expect.anything(),
      'user@example.com',
      service,
      expect.objectContaining({
        endpoint: '/api/ai/baai/bge-base-en-v1.5',
        promptTokens: expect.any(Number),
      }),
    );
    expect(onCost).toHaveBeenCalledWith(0.000045);
  });

  it('uses the service and Vectorize memory connected on the Save RAG node', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;

    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      catalogId: 'bge-base',
      embedModel: '@cf/baai/bge-base-en-v1.5',
      approvalStatus: 'approved',
    });

    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', chunkSize: 800, contentField: '{{ $json.content }}' },
        },
        {
          id: 'svc_embed',
          type: 'service_node',
          position: { x: 0, y: 0 },
          data: { endpoint: '/api/ai/baai/bge-base-en-v1.5' },
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
        { id: 'e-mem', source: 'mem_kb', target: 'save', sourceHandle: 'memory', targetHandle: 'memory' },
      ],
    };

    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ content: 'CREATE TABLE orders (id TEXT);', documentId: 'doc-1', source: 'orders.md' }],
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(billingMock.resolveServiceByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      '/api/ai/baai/bge-base-en-v1.5',
    );
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ namespace?: string; metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.namespace).toBe('uuser-1/kb-ns');
    expect(vectors[0]?.namespace).toBe('uuser-1/kb-ns');
  });
});

describe('n8n $json interpolation', () => {
  it('resolves {{ $json.body.question }}', () => {
    const scope = { body: { question: 'revenue last 30 days' }, $json: { body: { question: 'revenue last 30 days' } } };
    expect(interpolate('{{ $json.body.question }}', scope)).toBe('revenue last 30 days');
  });

  it('resolves tableName from the current loop item', () => {
    const item = { tableName: 'ORDERS', schemaName: 'ADMIN' };
    const scope = { ...item, items: [item], $json: { ...item, items: [item] } };
    expect(interpolate('{{ $json.tableName }}', scope)).toBe('ORDERS');
  });
});
