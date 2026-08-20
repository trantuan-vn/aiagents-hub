import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { ragDocumentsFromDbInfo } from './documents.js';
import { executeGetDbInfoPipeline, type GetDbInfoResult } from './execute.js';
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

describe('get-db-info documents', () => {
  it('emits schema + sqlexample RAG items', () => {
    const items = ragDocumentsFromDbInfo(info);
    expect(items).toHaveLength(2);
    expect(items[0]?.metadata.docType).toBe('schema');
    expect(items[1]?.metadata.docType).toBe('sqlexample');
    expect(items[0]?.content).toContain('# Table: public.orders');
    expect(items[1]?.content).toContain('SELECT * FROM public.orders');
  });
});

describe('executeGetDbInfoPipeline', () => {
  beforeEach(() => {
    directMock.listOracleTablesDirect.mockClear();
    directMock.introspectOracleTableDirect.mockClear();
  });

  it('lists a named table as a loop item without introspecting', async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [] }),
          first: async () => ({ cnt: 1 }),
        }),
        all: async () => ({ results: [] }),
        first: async () => ({ cnt: 1 }),
      })),
    };

    const definition: WorkflowDefinition = {
      nodes: [{ id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } }],
      edges: [],
    };

    const ctx = {
      node: definition.nodes[0],
      nodeInput: { tableName: 'orders', dbId: 'analytics-db', schemaName: 'public', connection: { type: 'd1' } },
      definition,
      outputs: {},
      runContext: {},
      c: { env: { D1DB: db } },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(out.tableCount).toBe(1);
    expect(out.tables).toEqual(['orders']);
    expect(Array.isArray(out.items)).toBe(true);
    expect((out.items as Array<{ tableName: string }>).length).toBe(1);
    expect((out.items as Array<{ tableName: string }>)[0]?.tableName).toBe('orders');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('lists D1 tables without introspecting schema', async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [] }),
          first: async () => ({ cnt: 0 }),
        }),
        all: async () => {
          if (sql.includes('sqlite_master')) {
            return { results: [{ name: 'orders' }, { name: 'users' }] };
          }
          return { results: [] };
        },
        first: async () => ({ cnt: 0 }),
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
    expect((out.items as Array<{ tableName: string }>).map((i) => i.tableName)).toEqual(['orders', 'users']);
    const sqlCalls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => s.includes('PRAGMA'))).toBe(false);
  });

  it('connects to OCI Oracle using user, password, and connectString from the previous node', async () => {
    const definition: WorkflowDefinition = {
      nodes: [{ id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } }],
      edges: [],
    };

    const connectString =
      '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-singapore-1.oraclecloud.com))(connect_data=(service_name=g3d495d60e13477_host10_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))';

    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        status: 200,
        data: {
          user: 'ADMIN',
          password: 'secret',
          connectString,
          tableName: 'ORDERS',
        },
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env: {} },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(directMock.introspectOracleTableDirect).not.toHaveBeenCalled();
    expect(out.schemaName).toBe('ADMIN');
    expect(out.tableCount).toBe(1);
    expect((out.items as Array<{ tableName: string; user?: string }>)[0]).toMatchObject({
      tableName: 'ORDERS',
    });
    expect((out.items as Array<{ user?: string }>)[0]?.user).toBeUndefined();
  });

  it('lists Oracle tables without introspecting when tableName is omitted', async () => {
    const definition: WorkflowDefinition = {
      nodes: [{ id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } }],
      edges: [],
    };

    const connectString =
      '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-singapore-1.oraclecloud.com))(connect_data=(service_name=g3d495d60e13477_host10_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))';

    const ctx = {
      node: definition.nodes[0],
      nodeInput: {
        status: 200,
        data: {
          user: 'ADMIN',
          password: 'secret',
          connectString,
        },
      },
      definition,
      outputs: {},
      runContext: {},
      c: { env: {} },
      meta: { ownerId: 'u1', workflowId: 1 },
    } as unknown as NodeContext;

    const out = await executeGetDbInfoPipeline(ctx);
    expect(directMock.listOracleTablesDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'ADMIN',
        password: 'secret',
        connectString,
      }),
      'ADMIN',
    );
    expect(directMock.introspectOracleTableDirect).not.toHaveBeenCalled();
    expect(out.tables).toEqual(['ORDERS']);
    expect((out.items as Array<{ tableName: string }>)[0]?.tableName).toBe('ORDERS');
    expect(JSON.stringify(out.items)).not.toContain('secret');
    expect(out.connection).toMatchObject({
      type: 'oracle',
      user: 'ADMIN',
      password: 'secret',
      connectString,
    });
  });
});
