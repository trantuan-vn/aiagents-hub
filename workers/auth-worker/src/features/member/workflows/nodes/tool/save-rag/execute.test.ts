import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeContext } from '../../types.js';
import { executeSaveRagPipeline } from './execute.js';

function mockAi() {
  return {
    run: vi.fn().mockImplementation(async (_model: string, input: { text: string | string[] }) => {
      const n = Array.isArray(input.text) ? input.text.length : 1;
      return { data: Array.from({ length: n }, () => [0.1, 0.2]) };
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
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag', chunkSize: 800 } },
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
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag' } },
      ],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[2],
      nodeInput: { items: [{ tableName: 'orders', schemaName: 'public' }] },
      definition,
      outputs: {
        form: { connection: { type: 'd1' }, dbId: 'analytics-db' },
        dbinfo: { schemaName: 'public', tables: ['orders'], items: [{ tableName: 'orders', schemaName: 'public' }] },
      },
      runContext: {},
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
    } as unknown as NodeContext;

    const out = await executeSaveRagPipeline(ctx);
    expect(out.ok).toBe(true);
    expect(out.saved).toBe(2);
  });

  it('indexes every Get DB Info table on the first loop tick, then skips the rest', async () => {
    const db = d1Stub();
    const upsert = vi.fn().mockResolvedValue({ count: 4 });
    const env = {
      AI: mockAi(),
      VECTORIZE: { query: vi.fn(), upsert },
      D1DB: db,
    } as unknown as Env;

    const definition: WorkflowDefinition = {
      nodes: [
        { id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag' } },
      ],
      edges: [],
    };

    const runContext: Record<string, unknown> = {};
    const ctx = {
      node: definition.nodes[1],
      nodeInput: { items: [{ tableName: 'orders', schemaName: 'public' }] },
      definition,
      outputs: {
        dbinfo: {
          schemaName: 'public',
          tables: ['orders', 'invoices'],
          items: [
            { tableName: 'orders', schemaName: 'public' },
            { tableName: 'invoices', schemaName: 'public' },
          ],
          connection: { type: 'd1' },
          dbId: 'analytics-db',
        },
      },
      runContext,
      c: { env },
      meta: { ownerId: 'user-1', workflowId: 42 },
    } as unknown as NodeContext;

    const first = await executeSaveRagPipeline(ctx);
    expect(first.ok).toBe(true);
    expect(first.saved).toBe(4);
    expect(upsert).toHaveBeenCalledTimes(1);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    const tables = new Set(vectors.map((v) => v.metadata?.tableName));
    expect(tables).toEqual(new Set(['orders', 'invoices']));

    const second = await executeSaveRagPipeline({
      ...ctx,
      nodeInput: { items: [{ tableName: 'invoices', schemaName: 'public' }] },
    } as unknown as NodeContext);
    expect(second.skipped).toBe(true);
    expect(second.saved).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('n8n $json interpolation', () => {
  it('resolves {{ $json.body.question }}', () => {
    const scope = { body: { question: 'revenue last 30 days' }, $json: { body: { question: 'revenue last 30 days' } } };
    expect(interpolate('{{ $json.body.question }}', scope)).toBe('revenue last 30 days');
  });
});
