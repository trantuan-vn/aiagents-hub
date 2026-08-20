import { toolNodeConfig } from '../shared/rag-context.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import {
  isOracleConnectionType,
  pickUpstreamString,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type OracleConnectConfig,
} from './connect-config.js';
import { ragDocumentsFromDbInfo, type RagDocumentItem } from './documents.js';
import { introspectOracleTable, introspectOracleTables, listOracleTables } from './oracle.js';

export type DbColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  comment?: string;
};

export type DbForeignKey = {
  column: string;
  refTable: string;
  refColumn: string;
};

export type SqlHistoryEntry = {
  sql: string;
  executedAt?: string;
  durationMs?: number;
  rowCount?: number;
};

export type GetDbInfoInput = {
  tableName?: string;
  schemaName?: string;
  sampleRowLimit?: number;
  sqlHistoryLimit?: number;
  includeSqlHistory?: boolean;
};

export type GetDbInfoResult = {
  dbId: string;
  schemaName: string;
  tableName: string;
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  sqlHistory: SqlHistoryEntry[];
  rowCountEstimate?: number;
};

export type GetDbInfoExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  input: GetDbInfoInput;
};

type DbConnection = {
  type: string;
  credentialKey?: string;
  databaseId?: string;
  user?: string;
  password?: string;
  connectString?: string;
};

async function listD1Tables(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all<{ name: string }>();
  return (results ?? []).map((r) => r.name);
}

async function introspectD1Table(
  db: D1Database,
  tableName: string,
  sampleLimit: number,
): Promise<Omit<GetDbInfoResult, 'dbId' | 'schemaName' | 'tableName' | 'sqlHistory'>> {
  const safeTable = tableName.replace(/"/g, '""');
  const pragma = await db.prepare(`PRAGMA table_info("${safeTable}")`).all<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }>();

  const columns: DbColumnInfo[] = (pragma.results ?? []).map((col) => ({
    name: col.name,
    type: col.type || 'TEXT',
    nullable: col.notnull === 0,
    default: col.dflt_value ?? undefined,
  }));

  const pkFromPragma = (pragma.results ?? []).filter((c) => Number((c as { pk?: number }).pk) > 0).map((c) => c.name);
  const resolvedPk = pkFromPragma;

  const fkRows = await db.prepare(`PRAGMA foreign_key_list("${safeTable}")`).all<{
    from: string;
    table: string;
    to: string;
  }>();
  const foreignKeys: DbForeignKey[] = (fkRows.results ?? []).map((fk) => ({
    column: fk.from,
    refTable: fk.table,
    refColumn: fk.to,
  }));

  const ddlParts = columns.map(
    (c) =>
      `"${c.name}" ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.default != null ? ` DEFAULT ${c.default}` : ''}`,
  );
  const ddl = `CREATE TABLE "${safeTable}" (\n  ${ddlParts.join(',\n  ')}\n);`;

  const sample = await db
    .prepare(`SELECT * FROM "${safeTable}" LIMIT ?`)
    .bind(sampleLimit)
    .all<Record<string, unknown>>();

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM "${safeTable}"`)
    .first<{ cnt: number }>();

  return {
    columns,
    primaryKey: resolvedPk,
    foreignKeys,
    ddl,
    sampleRows: sample.results ?? [],
    rowCountEstimate: countRow?.cnt,
  };
}

async function fetchSqlHistory(
  env: Env,
  dbId: string,
  tableName: string,
  limit: number,
  source: string,
): Promise<SqlHistoryEntry[]> {
  const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
  if (!db || source !== 'audit_log') return [];

  try {
    const { results } = await db
      .prepare(
        `SELECT sql, executedAt, durationMs, rowCount FROM workflow_sql_audit
         WHERE dbId = ? AND (sql LIKE ? OR tableName = ?)
         ORDER BY executedAt DESC LIMIT ?`,
      )
      .bind(dbId, `%${tableName}%`, tableName, limit)
      .all<SqlHistoryEntry>();
    return results ?? [];
  } catch {
    return [];
  }
}

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
}

export async function listDatabaseTables(
  env: Env,
  connection: DbConnection,
  schemaName = 'public',
  tableFilter = '*',
): Promise<string[]> {
  const oracleConfig = oracleConfigFrom(connection, connection);
  if (oracleConfig || isOracleConnectionType(connection.type)) {
    if (!oracleConfig) {
      throw new Error(
        'get_db_info: Oracle user, password, and connectString are required from the previous node',
      );
    }
    const owner = resolveOracleSchema(schemaName, oracleConfig.user);
    const tables = await listOracleTables(oracleConfig, owner, env);
    return filterTables(tables, tableFilter);
  }

  if (connection.type === 'd1') {
    const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (!db) return [];
    const tables = await listD1Tables(db);
    return filterTables(tables, tableFilter);
  }

  const metaDb = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
  if (metaDb) {
    try {
      const { results } = await metaDb
        .prepare(`SELECT table_name FROM workflow_db_tables WHERE db_id = ? AND schema_name = ?`)
        .bind(connection.databaseId ?? '', schemaName)
        .all<{ table_name: string }>();
      const names = (results ?? []).map((r) => r.table_name);
      if (names.length) return filterTables(names, tableFilter);
    } catch {
      /* table may not exist */
    }
  }

  return filterTables([], tableFilter);
}

function filterTables(tables: string[], tableFilter: string): string[] {
  const filter = tableFilter.trim();
  if (!filter || filter === '*') return tables;
  if (filter.includes(',')) {
    const allowed = new Set(filter.split(',').map((s) => s.trim()).filter(Boolean));
    return tables.filter((t) => allowed.has(t));
  }
  if (filter.includes('*')) {
    const re = new RegExp(`^${filter.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    return tables.filter((t) => re.test(t));
  }
  return tables.filter((t) => t === filter);
}

export async function executeGetDbInfo(params: GetDbInfoExecuteParams): Promise<GetDbInfoResult> {
  const { env, definition, agentId, triggerContext, input } = params;
  const config = toolNodeConfig(definition, agentId, 'get-db-info') ?? {};

  const connection = (triggerContext.connection ?? {}) as DbConnection;
  const oracleConfig = oracleConfigFrom(triggerContext, connection);
  const dbId = String(triggerContext.dbId ?? triggerContext.databaseId ?? '');
  const tableName = input.tableName ?? String(triggerContext.tableName ?? '');
  if (!tableName) throw new Error('get_db_info: tableName is required');

  const requestedSchema = input.schemaName ?? String(triggerContext.schemaName ?? 'public');
  const schemaName = oracleConfig
    ? resolveOracleSchema(requestedSchema, oracleConfig.user)
    : requestedSchema;

  const limits = (triggerContext.limits ?? {}) as Record<string, unknown>;
  const sampleLimit =
    input.sampleRowLimit ??
    (Number(config.sampleRowLimit ?? limits.sampleRowLimit ?? 10) || 10);
  const historyLimit =
    input.sqlHistoryLimit ??
    (Number(config.sqlHistoryLimit ?? limits.sqlHistoryLimit ?? 10) || 10);
  const historySource = String(config.sqlHistorySource ?? 'audit_log');

  const explicitType = String(connection.type ?? triggerContext.connectionType ?? '').trim().toLowerCase();
  const connType = explicitType || (oracleConfig ? 'oracle' : '');

  let introspection: Omit<GetDbInfoResult, 'dbId' | 'schemaName' | 'tableName' | 'sqlHistory'>;

  if (oracleConfig || isOracleConnectionType(connType)) {
    if (!oracleConfig) {
      throw new Error(
        'get_db_info: Oracle user, password, and connectString are required from the previous node',
      );
    }
    introspection = await introspectOracleTable(oracleConfig, schemaName, tableName, sampleLimit, env);
  } else if (connType === 'd1' || explicitType === 'd1') {
    const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (!db) throw new Error('get_db_info: D1 binding not configured');
    introspection = await introspectD1Table(db, tableName, sampleLimit);
  } else {
    throw new Error(
      `get_db_info: no database connection for table "${tableName}" (need Oracle user/password/connectString or connection.type=d1 from Form / Get DB Info)`,
    );
  }

  const includeSqlHistory = input.includeSqlHistory ?? config.includeSqlHistory !== false;
  const sqlHistory = includeSqlHistory
    ? await fetchSqlHistory(env, dbId, tableName, historyLimit, historySource)
    : [];

  const sampleRows =
    config.includeSampleRows !== false ? introspection.sampleRows : [];

  return {
    dbId,
    schemaName,
    tableName,
    ...introspection,
    sampleRows,
    sqlHistory,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function triggerContextFromNodeInput(nodeInput: NodeOutput, data: Record<string, unknown>): Record<string, unknown> {
  const fields = asRecord(nodeInput.fields);
  const merged = { ...fields, ...nodeInput, ...data };
  const oracleConfig = resolveOracleConnectConfig(merged);
  const defaultType = oracleConfig ? 'oracle' : 'd1';
  const connectionType = String(
    nodeInput.connectionType ?? fields.connectionType ?? data.connectionType ?? defaultType,
  );
  const incomingConnection = asRecord(nodeInput.connection);
  const tableName =
    pickUpstreamString(merged, ['tableName', 'table_name']) || String(data.tableName ?? '');
  const schemaName =
    pickUpstreamString(merged, ['schemaName', 'schema_name', 'owner', 'schema']) ||
    String(data.schemaName ?? 'public');
  return {
    ...fields,
    ...nodeInput,
    dbId:
      pickUpstreamString(merged, ['dbId', 'databaseId', 'database_id']) ||
      String(data.databaseId ?? ''),
    databaseId:
      pickUpstreamString(merged, ['databaseId', 'dbId', 'database_id']) ||
      String(data.databaseId ?? ''),
    schemaName,
    tableName,
    tableFilter:
      pickUpstreamString(merged, ['tableFilter', 'table_filter']) || String(data.tableFilter ?? '*'),
    connectionType,
    credentialKey: nodeInput.credentialKey ?? fields.credentialKey ?? data.credentialKey ?? '',
    connection: {
      type: String(incomingConnection.type ?? connectionType),
      credentialKey: String(
        incomingConnection.credentialKey ?? nodeInput.credentialKey ?? fields.credentialKey ?? data.credentialKey ?? '',
      ),
      databaseId: String(
        incomingConnection.databaseId ?? nodeInput.databaseId ?? nodeInput.dbId ?? fields.databaseId ?? data.databaseId ?? '',
      ),
      ...(oracleConfig ?? {}),
    },
    limits: nodeInput.limits ?? {
      sampleRowLimit: data.sampleRowLimit ?? 10,
      sqlHistoryLimit: data.sqlHistoryLimit ?? 10,
    },
  };
}

export type TableLoopItem = {
  tableName: string;
  schemaName: string;
};

function buildTableLoopItem(tableName: string, schemaName: string): TableLoopItem {
  return { tableName, schemaName };
}

function truncateSampleRows(info: GetDbInfoResult, sampleLimit: number): GetDbInfoResult {
  info.sampleRows = info.sampleRows.slice(0, sampleLimit).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v;
    }
    return out;
  });
  return info;
}

const RAG_SAMPLE_LIMIT = 3;

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Introspect one table and emit schema + sqlexample documents for Save RAG. */
export async function introspectTableToRagDocuments(params: {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tableName: string;
  schemaName?: string;
}): Promise<RagDocumentItem[]> {
  const limits = asRecord(params.triggerContext.limits);
  const sampleLimit = Math.min(
    Number(limits.sampleRowLimit ?? RAG_SAMPLE_LIMIT) || RAG_SAMPLE_LIMIT,
    RAG_SAMPLE_LIMIT,
  );
  const info = await executeGetDbInfo({
    env: params.env,
    definition: params.definition,
    agentId: params.agentId,
    triggerContext: { ...params.triggerContext, tableName: params.tableName },
    input: {
      tableName: params.tableName,
      schemaName: params.schemaName,
      sampleRowLimit: sampleLimit,
      sqlHistoryLimit: 0,
      includeSqlHistory: false,
    },
  });
  return ragDocumentsFromDbInfo(truncateSampleRows(info, sampleLimit));
}

/** Batch-introspect many tables for RAG (one Oracle session; skip SQL history). */
export async function introspectTablesToRagDocuments(params: {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tables: Array<{ tableName: string; schemaName?: string }>;
}): Promise<RagDocumentItem[]> {
  const tables = params.tables
    .map((t) => ({
      tableName: String(t.tableName ?? '').trim(),
      schemaName: String(t.schemaName ?? ''),
    }))
    .filter((t) => t.tableName);
  if (!tables.length) return [];
  if (tables.length === 1) {
    return introspectTableToRagDocuments({ ...params, ...tables[0]! });
  }

  const connection = (params.triggerContext.connection ?? {}) as DbConnection;
  const oracleConfig = oracleConfigFrom(params.triggerContext, connection);
  const explicitType = String(connection.type ?? params.triggerContext.connectionType ?? '')
    .trim()
    .toLowerCase();
  const connType = explicitType || (oracleConfig ? 'oracle' : '');
  const dbId = String(params.triggerContext.dbId ?? params.triggerContext.databaseId ?? '');
  const sampleLimit = RAG_SAMPLE_LIMIT;

  if (oracleConfig || isOracleConnectionType(connType)) {
    if (!oracleConfig) {
      throw new Error(
        'get_db_info: Oracle user, password, and connectString are required from the previous node',
      );
    }
    const schemaName = resolveOracleSchema(tables[0]!.schemaName, oracleConfig.user);
    const introspected = await introspectOracleTables(
      oracleConfig,
      schemaName,
      tables.map((t) => t.tableName),
      sampleLimit,
      params.env,
    );
    const docs: RagDocumentItem[] = [];
    for (const row of introspected) {
      if (row.error || !row.columns.length) {
        console.warn(`[get-db-info] skip table ${row.tableName}: ${row.error || 'no columns'}`);
        continue;
      }
      docs.push(
        ...ragDocumentsFromDbInfo(
          truncateSampleRows(
            {
              dbId,
              schemaName,
              tableName: row.tableName,
              columns: row.columns,
              primaryKey: row.primaryKey,
              foreignKeys: row.foreignKeys,
              ddl: row.ddl,
              sampleRows: row.sampleRows,
              sqlHistory: [],
              rowCountEstimate: row.rowCountEstimate,
            },
            sampleLimit,
          ),
        ),
      );
    }
    return docs;
  }

  if (connType !== 'd1' && explicitType !== 'd1') {
    throw new Error(
      `get_db_info: no database connection for ${tables.length} table(s) (need Oracle user/password/connectString from Form / Get DB Info — run those nodes first, or Execute workflow from the form)`,
    );
  }

  const nested = await mapPool(tables, 4, (table) =>
    introspectTableToRagDocuments({
      ...params,
      tableName: table.tableName,
      schemaName: table.schemaName,
      triggerContext: { ...params.triggerContext, tableName: table.tableName },
    }),
  );
  return nested.flat();
}

/** Graph-path execute: list tables only — loop items carry connection context for per-table Save RAG. */
export async function executeGetDbInfoPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const triggerContext = triggerContextFromNodeInput(ctx.nodeInput, data);
  const connection = asRecord(triggerContext.connection) as DbConnection;
  const oracleConfig = oracleConfigFrom(triggerContext, connection);
  const schemaName = oracleConfig
    ? resolveOracleSchema(String(triggerContext.schemaName ?? ''), oracleConfig.user)
    : String(triggerContext.schemaName ?? 'public');
  const tableFilter = String(triggerContext.tableFilter ?? '*');
  const namedTable = String(triggerContext.tableName ?? '').trim();

  const tables = namedTable
    ? [namedTable]
    : await listDatabaseTables(ctx.c.env, connection, schemaName, tableFilter);

  if (!tables.length) {
    throw new Error(
      oracleConfig
        ? `get_db_info: no tables found in Oracle schema ${schemaName} (set tableName on the form, or check the user can see ALL_TABLES)`
        : 'get_db_info: no tables found (previous node must provide user/password/connectString or u/p/c, and tableName)',
    );
  }

  const maxTables = 25;
  const selected = tables.slice(0, maxTables);
  const items = selected.map((tableName) => buildTableLoopItem(tableName, schemaName));

  // Keep connection on the node output (not on each loop item) so Loop / Save RAG can introspect Oracle.
  const connectionOut = oracleConfig
    ? { type: 'oracle' as const, ...oracleConfig, ...asRecord(connection) }
    : asRecord(triggerContext.connection);

  return {
    dbId: String(triggerContext.dbId ?? ''),
    schemaName,
    tables: selected,
    items,
    count: items.length,
    tableCount: selected.length,
    connection: connectionOut,
    ...(oracleConfig
      ? {
          user: oracleConfig.user,
          password: oracleConfig.password,
          connectString: oracleConfig.connectString,
          connectionType: 'oracle',
        }
      : {}),
  };
}
