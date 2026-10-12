import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeContext } from '../../types.js';
import { vectorChunkId } from '../../../rag/index.js';
import { schemaDocumentId } from './documents.js';
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
});

const oracleMock = vi.hoisted(() => ({
  introspectOracleTableDirect: vi.fn(
    async (_config: unknown, _schema: string, tableName: string) => ({
      columns: [
        { name: 'id', type: 'NUMBER', nullable: false },
        { name: 'total', type: 'NUMBER', nullable: false },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      ddl: `CREATE TABLE "${tableName}" ("id" NUMBER, "total" NUMBER)`,
      sampleRows: [{ id: 1, total: 10 }],
      rowCountEstimate: 1,
    }),
  ),
}));

vi.mock('@aiagents-hub/oracle-db', () => oracleMock);

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
          ...extraSaveData,
        },
      },
      {
        id: 'svc_embed',
        type: 'service_node',
        position: { x: 0, y: 0 },
        data: { endpoint: '/api/ai/baai/bge-m3' },
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
          embedModel: '@cf/baai/bge-m3',
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
    oracleMock.introspectOracleTableDirect.mockClear();
    billingMock.getModelForService.mockImplementation((service: Record<string, unknown>) => {
      const id = String(service.model ?? service.embedModel ?? service.catalogId ?? '');
      if (id.includes('bge') || id.includes('embed')) return '@cf/baai/bge-m3';
      return '@cf/meta/llama-3.1-8b-instruct';
    });
  });

  it('introspects a loop table item then upserts one schema document', async () => {
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
            limits: { sampleRowLimit: 3 },
          },
        ],
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBeGreaterThanOrEqual(1);
    expect(billingMock.runTextModel).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    const docTypes = new Set(vectors.map((v) => v.metadata?.docType));
    expect(docTypes).toEqual(new Set(['schema']));
    expect(vectors.some((v) => String(v.metadata?.documentId).endsWith('.sqlexample'))).toBe(false);
    expect(vectors.some((v) => v.metadata?.tableName === 'orders')).toBe(true);
    const schema = vectors.find((v) => v.metadata?.docType === 'schema');
    expect(schema?.metadata?.text).toContain('# public.orders');
    expect(schema?.metadata?.text).toContain('VI: Khóa chính EN: Primary key');
    expect(schema?.metadata?.text).toContain('VI: Tổng tiền EN: Total');
    expect(schema?.metadata?.text).toContain('doanh thu');
    expect(schema?.metadata?.text).not.toContain('CREATE TABLE');
    expect(schema?.metadata?.formatVersion).toBe('2');
    expect(schema?.metadata).not.toHaveProperty('content');
    const saved = upsert.mock.calls[0]?.[0] as Array<{ id: string }>;
    expect(saved[0]?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(out.enrichedColumns).toBe(2);
    expect(out.llmCalls).toBe(2);
    const systems = billingMock.runTextModel.mock.calls.map((call) => {
      const messages = call[2] as Array<{ role: string; content: string }>;
      return messages.find((message) => message.role === 'system')?.content ?? '';
    });
    expect(systems.some((system) => system.startsWith('You describe Oracle columns'))).toBe(true);
    expect(systems.some((system) => system.startsWith('You summarize one Oracle table'))).toBe(true);
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
      executionKey: '11111111-1111-4111-8111-111111111111',
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

  it('connects to Oracle from Save RAG credential fields when the loop item has no connection', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 2 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;

    const definition = saveRagGraph({
      userField: '{{ $json.u }}',
      passwordField: '{{ $json.p }}',
      connectStringField: '{{ $json.c }}',
      schemaNameField: '{{ $json.s }}',
    });
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'ORDERS' }],
        u: 'ADMIN',
        p: 'secret',
        c: 'dbname_high',
        s: 'SALES',
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(oracleMock.introspectOracleTableDirect).toHaveBeenCalledWith(
      { user: 'ADMIN', password: 'secret', connectString: 'dbname_high' },
      'SALES',
      'ORDERS',
      3,
    );
    expect(upsert).toHaveBeenCalled();
  });

  it('still uses an Oracle connection object already on INPUT', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;
    const definition = saveRagGraph({
      userField: '',
      passwordField: '',
      connectStringField: '',
      schemaNameField: '',
    });
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'ORDERS', schemaName: 'SALES' }],
        connection: {
          type: 'oracle',
          user: 'ADMIN',
          password: 'secret',
          connectString: 'dbname_high',
        },
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(oracleMock.introspectOracleTableDirect).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'ADMIN', password: 'secret', connectString: 'dbname_high' }),
      'SALES',
      'ORDERS',
      3,
    );
  });

  it('reports no database connection when Save RAG has no Oracle fields and no connection', async () => {
    const definition = saveRagGraph({
      userField: '',
      passwordField: '',
      connectStringField: '',
      schemaNameField: '',
    });
    const ctx = {
      node: definition.nodes[0],
      nodeInput: { items: [{ tableName: 'ORDERS' }] },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env: {} },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    await expect(executeSaveRagPipeline(ctx)).rejects.toThrow(/no database connection/);
    expect(oracleMock.introspectOracleTableDirect).not.toHaveBeenCalled();
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
      executionKey: '11111111-1111-4111-8111-111111111111',
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
      executionKey: '11111111-1111-4111-8111-111111111111',
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
      '/api/ai/baai/bge-m3',
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      userDO: {},
    } as unknown as NodeContext;

    await expect(executeSaveRagPipeline(ctx)).rejects.toThrow(/LLM handle/i);
  });

  it('prepends the domain system prompt and still keeps the JSON rules last', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;
    billingMock.runTextModel.mockClear();
    const definition = saveRagGraph({
      describeSystemPrompt: 'Bạn là chuyên gia kế toán. Diễn giải bằng doanh thu thuần.',
    });
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' }],
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    await executeSaveRagPipeline(ctx);
    const systems = billingMock.runTextModel.mock.calls.map((call) => {
      const messages = call[2] as Array<{ role: string; content: string }>;
      return messages.find((message) => message.role === 'system')?.content ?? '';
    });
    expect(systems.length).toBeGreaterThanOrEqual(2);
    for (const system of systems) {
      expect(system.startsWith('Bạn là chuyên gia kế toán.')).toBe(true);
      expect(system.indexOf('doanh thu thuần')).toBeLessThan(system.indexOf('Return ONLY one JSON object'));
      expect(system).toContain('at most 240 characters');
    }
    const text = (upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>)[0]?.metadata?.text ?? '';
    expect(text).toContain('Đơn hàng');
    expect(text).toContain('doanh thu');
  });

  it('does not upsert or mark indexed when a column is missing one language', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;
    billingMock.extractTextFromAiResponse.mockReturnValue(
      JSON.stringify({
        tableSummaryVi: 'Đơn hàng',
        tableSummaryEn: 'Orders',
        columns: [
          { name: 'id', descriptionVi: 'Khóa chính', descriptionEn: '', aliasesVi: [] },
          { name: 'total', descriptionVi: 'Tổng tiền', descriptionEn: 'Total', aliasesVi: [] },
        ],
      }),
    );
    const definition = saveRagGraph();
    const runContext: Record<string, unknown> = {};
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' }],
      },
      definition,
      outputs: {},
      runContext,
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    await expect(executeSaveRagPipeline(ctx)).rejects.toThrow(/column "id" enrichment failed/i);
    expect(upsert).not.toHaveBeenCalled();
    expect(runContext.__saveRagIndexedTables).toBeUndefined();
  });

  it('reports a table already in Vectorize and saves only the next table', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const ordersId = schemaDocumentId('analytics-db', 'public', 'orders');
    const ordersChunk = await vectorChunkId(ordersId, 0);
    const getByIds = vi.fn().mockImplementation(async (ids: string[]) =>
      ids.includes(ordersChunk)
        ? [
            {
              id: ordersChunk,
              metadata: {
                documentId: ordersId,
                docType: 'schema',
                tableName: 'orders',
                schemaName: 'public',
                namespace: 'uuser-1/kb-ns',
              },
            },
          ]
        : [],
    );
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert, getByIds },
      D1DB: db,
    } as unknown as Env;
    billingMock.runTextModel.mockClear();
    const definition = saveRagGraph();
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [
          { tableName: 'orders', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' },
          { tableName: 'invoices', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' },
        ],
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    const sqls = db.prepare.mock.calls.map((call) => String(call[0]));
    expect(out.ok).toBe(true);
    expect(out.alreadyExists).toEqual(['orders']);
    expect(out.tables).toEqual(['orders', 'invoices']);
    expect(out.saved).toBeGreaterThanOrEqual(1);
    expect(out.llmCalls).toBe(2);
    expect(sqls.some((sql) => sql.includes('orders'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('invoices'))).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    expect(vectors.every((vector) => vector.metadata?.tableName === 'invoices')).toBe(true);
    const skipped = (out.items as Array<Record<string, unknown>>).find((item) => item.tableName === 'orders');
    expect(skipped).toMatchObject({
      ok: true,
      saved: 0,
      skipped: true,
      reason: 'already exists in Vectorize',
      documentId: ordersId,
    });
  });

  it('does not call the LLM or upsert when every table is already in Vectorize', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const ordersId = schemaDocumentId('analytics-db', 'public', 'orders');
    const ordersChunk = await vectorChunkId(ordersId, 0);
    const getByIds = vi.fn().mockResolvedValue([
      {
        id: ordersChunk,
        metadata: {
          documentId: ordersId,
          docType: 'schema',
          tableName: 'orders',
          schemaName: 'public',
          namespace: 'uuser-1/kb-ns',
        },
      },
    ]);
    const db = d1Stub();
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert, getByIds },
      D1DB: db,
    } as unknown as Env;
    billingMock.runTextModel.mockClear();
    const definition = saveRagGraph();
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        items: [{ tableName: 'orders', schemaName: 'public', connection: { type: 'd1' }, dbId: 'analytics-db' }],
      },
      definition,
      outputs: {},
      runContext: {},
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out).toMatchObject({
      ok: true,
      saved: 0,
      skipped: true,
      reason: 'already exists in Vectorize',
      alreadyExists: ['orders'],
      tables: ['orders'],
      llmCalls: 0,
      enrichedColumns: 0,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(billingMock.runTextModel).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('still saves when the stored vector belongs to another namespace', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const ordersId = schemaDocumentId('analytics-db', 'public', 'orders');
    const ordersChunk = await vectorChunkId(ordersId, 0);
    const getByIds = vi.fn().mockResolvedValue([
      {
        id: ordersChunk,
        metadata: {
          documentId: ordersId,
          docType: 'schema',
          tableName: 'orders',
          namespace: 'uother/kb-ns',
        },
      },
    ]);
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert, getByIds },
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.saved).toBeGreaterThanOrEqual(1);
    expect(out.alreadyExists).toBeUndefined();
    expect(upsert).toHaveBeenCalled();
  });

  it('still saves when the Vectorize existence check fails', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const getByIds = vi.fn().mockRejectedValue(new Error('vectorize down'));
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert, getByIds },
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
      executionKey: '11111111-1111-4111-8111-111111111111',
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
      user: { identifier: 'user@example.com' },
      bindingName: 'USER_DO',
      userDO: {},
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.saved).toBeGreaterThanOrEqual(1);
    expect(upsert).toHaveBeenCalled();
  });
});

describe('executeSaveRag (embed prepared docs)', () => {
  beforeEach(() => {
    billingMock.resolveServiceByEndpoint.mockResolvedValue({
      id: 9,
      endpoint: '/api/ai/baai/bge-m3',
      model: '@cf/baai/bge-m3',
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
          data: { toolKind: 'save-rag', serviceEndpoint: '/api/ai/baai/bge-m3' },
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

  it('does not upsert when the embedding vector is empty', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[]] }) },
      VECTORIZE: { query: vi.fn(), upsert },
    } as unknown as Env;
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'save',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'save-rag', serviceEndpoint: '/api/ai/baai/bge-m3' },
        },
      ],
      edges: [],
    };

    await expect(
      executeSaveRag({
        env,
        definition,
        agentId: 'save',
        input: { content: 'CREATE TABLE orders (id TEXT);', documentId: 'db.public.orders.schema' },
        userDO: {} as never,
        ownerId: 'user-1',
        workflowId: 42,
      }),
    ).rejects.toThrow(/empty embedding/);
    expect(upsert).not.toHaveBeenCalled();
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
