import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { ragDocumentsFromEnrichment } from '../save-rag/documents.js';
import {
  introspectTableToRagDocuments,
  introspectTablesToRagDocuments,
} from '../save-rag/table-docs.js';
import { executeGetDbInfo, executeGetDbInfoPipeline, type GetDbInfoResult } from './execute.js';
import type { NodeContext } from '../../types.js';

const directMock = vi.hoisted(() => ({
  listOracleTablesDirect: vi.fn(async () => ['ORDERS']),
  introspectOracleTableDirect: vi.fn(async () => ({
    columns: [{ name: 'ID', type: 'NUMBER(10)', nullable: false, comment: 'pk' }],
    primaryKey: ['ID'],
    foreignKeys: [],
    ddl: 'CREATE TABLE "ADMIN"."ORDERS" (\n  "ID" NUMBER(10) NOT NULL\n);',
    sampleRows: [{ ID: 1 }],
    rowCountEstimate: 3,
  })),
  introspectOracleTablesDirect: vi.fn(async (_config: unknown, _schema: string, tables: string[]) =>
    tables.map((tableName) => ({
      tableName,
      columns: [{ name: 'ID', type: 'NUMBER(10)', nullable: false, comment: 'pk' }],
      primaryKey: ['ID'],
      foreignKeys: [],
      ddl: `CREATE TABLE "ADMIN"."${tableName}" (\n  "ID" NUMBER(10) NOT NULL\n);`,
      sampleRows: [{ ID: 1 }],
      rowCountEstimate: 3,
    })),
  ),
  fetchOracleSqlHistoriesDirect: vi.fn(async (_config: unknown, tables: string[]) =>
    Object.fromEntries(
      tables.map((table) => [
        String(table).toUpperCase(),
        [
          {
            sql: `SELECT * FROM ADMIN.${String(table).toUpperCase()} WHERE ROWNUM <= 10`,
            executedAt: '2026-09-21T10:00:00.000Z',
          },
        ],
      ]),
    ),
  ),
}));

vi.mock('@aiagents-hub/oracle-db', () => directMock);

const info: GetDbInfoResult = {
  dbId: 'analytics-db',
  schemaName: 'public',
  tableName: 'orders',
  columns: [
    { name: 'id', type: 'TEXT', nullable: false },
    { name: 'total', type: 'REAL', nullable: false, default: '0' },
  ],
  primaryKey: ['id'],
  foreignKeys: [],
  ddl: 'CREATE TABLE "orders" (\n  "id" TEXT NOT NULL,\n  "total" REAL NOT NULL DEFAULT 0\n);',
  sampleRows: [{ id: '1', total: 10 }],
  sqlHistory: [],
  rowCountEstimate: 1,
};

describe('save-rag documents (schema + sqlexample)', () => {
  it('emits schema document; sqlexample only when history or typical queries exist', () => {
    const items = ragDocumentsFromEnrichment(info);
    expect(items).toHaveLength(1);
    expect(items[0]?.metadata.docType).toBe('schema');
    expect(items[0]?.content).toContain('# Table: public.orders');
    expect(items[0]?.content).toContain('Description (VI)');
  });

  it('renders historical SQL from Oracle execution history', () => {
    const items = ragDocumentsFromEnrichment({
      ...info,
      sqlHistory: [
        {
          sql: 'SELECT * FROM public.orders WHERE total > 100',
          executedAt: '2026-09-21T10:00:00.000Z',
          rowCount: 4,
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[1]?.content).toContain('### 1. Historical query');
    expect(items[1]?.content).toContain('SELECT * FROM public.orders WHERE total > 100');
    expect(items[1]?.content).toContain('Executed: 2026-09-21T10:00:00.000Z');
  });
});

describe('executeGetDbInfoPipeline', () => {
  beforeEach(() => {
    directMock.listOracleTablesDirect.mockClear();
  });

  it('lists a named table as a loop item without introspecting', async () => {
    const db = {
      prepare: vi.fn(() => ({
        all: async () => ({ results: [] }),
        first: async () => ({ cnt: 0 }),
        bind: () => ({ all: async () => ({ results: [] }), first: async () => ({ cnt: 0 }) }),
      })),
    };
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'dbinfo',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-db-info', tableNameField: '{{ $json.tableName }}' },
        },
      ],
      edges: [],
    };
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        tableName: 'orders',
        dbId: 'analytics-db',
        schemaName: 'public',
        connection: { type: 'd1' },
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env: { D1DB: db } },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(out.tables).toEqual(['orders']);
    expect(out.items).toEqual([{ tableName: 'orders', schemaName: 'public' }]);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('lists D1 tables without introspecting schema', async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        all: async () => {
          if (sql.includes('sqlite_master')) {
            return { results: [{ name: 'orders' }, { name: 'users' }] };
          }
          return { results: [] };
        },
        first: async () => ({ cnt: 0 }),
        bind: () => ({ all: async () => ({ results: [] }), first: async () => ({ cnt: 0 }) }),
      })),
    };
    const definition: WorkflowDefinition = {
      nodes: [{ id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } }],
      edges: [],
    };
    const ctx = {
      node: definition.nodes[0],
      nodeInput: { dbId: 'analytics-db', schemaName: 'public', connection: { type: 'd1' } },
      definition,
      outputs: {},
      runContext: {},
      c: { env: { D1DB: db } },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(out.tables).toEqual(['orders', 'users']);
    expect(out.items).toHaveLength(2);
  });

  it('lists Oracle tables without introspecting when tableName is omitted', async () => {
    directMock.listOracleTablesDirect.mockResolvedValueOnce(['ORDERS', 'USERS']);
    const definition: WorkflowDefinition = {
      nodes: [{ id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } }],
      edges: [],
    };
    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        schemaName: 'ADMIN',
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
      c: { env: {} },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(out.schemaName).toBe('ADMIN');
    expect(out.tables).toEqual(['ORDERS', 'USERS']);
    expect(directMock.listOracleTablesDirect).toHaveBeenCalled();
    expect(directMock.introspectOracleTableDirect).not.toHaveBeenCalled();
  });

  it('agent tool lists tables only', async () => {
    directMock.listOracleTablesDirect.mockResolvedValueOnce(['A', 'B']);
    const out = await executeGetDbInfo({
      env: {} as Env,
      definition: { nodes: [], edges: [] },
      agentId: 'dbinfo',
      triggerContext: {
        schemaName: 'ADMIN',
        connection: {
          type: 'oracle',
          user: 'ADMIN',
          password: 'secret',
          connectString: 'dbname_high',
        },
      },
      input: {},
    });
    expect(out).toEqual({
      ok: true,
      schemaName: 'ADMIN',
      tables: ['A', 'B'],
      count: 2,
      connection: expect.objectContaining({ type: 'oracle', user: 'ADMIN' }),
    });
    expect(directMock.introspectOracleTableDirect).not.toHaveBeenCalled();
  });
});

const oracleConn = {
  type: 'oracle',
  user: 'ADMIN',
  password: 'secret',
  connectString: 'dbname_high',
};

describe('Save RAG SQL history (via table-docs)', () => {
  beforeEach(() => {
    directMock.fetchOracleSqlHistoriesDirect.mockClear();
    directMock.introspectOracleTablesDirect.mockClear();
  });

  it('Save RAG uses get-db-info config instead of hard-coded history limit 0', async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'dbinfo',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-db-info', sqlHistoryLimit: 5, includeSqlHistory: true },
        },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag' } },
      ],
      edges: [],
    };

    const docs = await introspectTableToRagDocuments({
      env: {} as Env,
      definition,
      agentId: 'save',
      triggerContext: {
        tableName: 'ORDERS',
        schemaName: 'ADMIN',
        connection: oracleConn,
      },
      tableName: 'ORDERS',
      schemaName: 'ADMIN',
    });

    expect(directMock.fetchOracleSqlHistoriesDirect).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'ADMIN' }),
      ['ORDERS'],
      5,
    );
    expect(docs[1]?.content).toContain('SELECT * FROM ADMIN.ORDERS WHERE ROWNUM <= 10');
    expect(docs[1]?.content).toContain('### 1. Historical query');
  });

  it('batch RAG introspect attaches Oracle SQL history per table', async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        {
          id: 'dbinfo',
          type: 'tool_node',
          position: { x: 0, y: 0 },
          data: { toolKind: 'get-db-info', sqlHistoryLimit: 4, includeSqlHistory: true },
        },
        { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag' } },
      ],
      edges: [],
    };

    const docs = await introspectTablesToRagDocuments({
      env: {} as Env,
      definition,
      agentId: 'save',
      triggerContext: { schemaName: 'ADMIN', connection: oracleConn },
      tables: [
        { tableName: 'CHUNG_KHOAN', schemaName: 'ADMIN' },
        { tableName: 'NHA_DAU_TU', schemaName: 'ADMIN' },
      ],
    });

    expect(directMock.fetchOracleSqlHistoriesDirect).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'ADMIN' }),
      ['CHUNG_KHOAN', 'NHA_DAU_TU'],
      4,
    );
    const examples = docs.filter((d) => d.metadata.docType === 'sqlexample');
    expect(examples).toHaveLength(2);
  });
});
