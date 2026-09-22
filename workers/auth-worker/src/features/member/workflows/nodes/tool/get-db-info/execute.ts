import {
  GET_DB_INFO_CONNECT_STRING_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_USER_FIELD,
} from '@aiagents-hub/workflow-nodes';
import { toolNodeConfig } from '../shared/rag-context.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import {
  filterTables,
  fetchSqlHistory as fetchOracleSqlHistories,
  introspectTable as introspectOracleTable,
  isOracleConnectionType,
  listDatabaseTables,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type DbColumnInfo,
  type DbConnection,
  type DbForeignKey,
  type GetDbInfoInput,
  type GetDbInfoResult,
  type OracleConnectConfig,
  type SqlHistoryEntry,
} from '../shared/db/index.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';

export type {
  DbColumnInfo,
  DbForeignKey,
  GetDbInfoInput,
  GetDbInfoResult,
  SqlHistoryEntry,
} from '../shared/db/index.js';

export { listDatabaseTables } from '../shared/db/index.js';

export type GetDbInfoExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  input: GetDbInfoInput;
};

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

const SQL_HISTORY_LIMIT_DEFAULT = 10;
const SQL_HISTORY_LIMIT_MAX = 50;

function getDbInfoConfig(
  definition: import('../../../domain/domain.js').WorkflowDefinition,
  agentId: string,
): Record<string, unknown> {
  const linked = toolNodeConfig(definition, agentId, 'get-db-info');
  if (linked) return linked;
  const node = definition.nodes.find((n) => {
    if (n.type !== 'tool_node') return false;
    return String((n.data as Record<string, unknown> | undefined)?.toolKind ?? '') === 'get-db-info';
  });
  return (node?.data ?? {}) as Record<string, unknown>;
}

function resolveSqlHistorySettings(
  config: Record<string, unknown>,
  triggerContext: Record<string, unknown>,
  input?: GetDbInfoInput,
): { include: boolean; limit: number } {
  const limits = asRecord(triggerContext.limits);
  const include = input?.includeSqlHistory ?? config.includeSqlHistory !== false;
  const raw = input?.sqlHistoryLimit ?? config.sqlHistoryLimit ?? limits.sqlHistoryLimit ?? SQL_HISTORY_LIMIT_DEFAULT;
  const parsed = Number(raw);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(0, Math.floor(parsed)), SQL_HISTORY_LIMIT_MAX)
    : SQL_HISTORY_LIMIT_DEFAULT;
  return { include, limit };
}

function historyKey(tableName: string): string {
  return tableName.trim().toUpperCase();
}

async function fetchSqlHistory(params: {
  oracleConfig: OracleConnectConfig | null;
  tableNames: string[];
  limit: number;
  env: Env;
}): Promise<Record<string, SqlHistoryEntry[]>> {
  if (!params.oracleConfig || params.limit <= 0 || !params.tableNames.length) return {};
  try {
    const rows = await fetchOracleSqlHistories(
      params.oracleConfig,
      params.tableNames,
      params.limit,
      params.env,
    );
    const out: Record<string, SqlHistoryEntry[]> = {};
    for (const [table, entries] of Object.entries(rows)) {
      out[historyKey(table)] = (entries ?? []).map((entry) => ({
        sql: String(entry.sql ?? ''),
        ...(entry.executedAt ? { executedAt: String(entry.executedAt) } : {}),
        ...(entry.durationMs != null ? { durationMs: Number(entry.durationMs) } : {}),
        ...(entry.rowCount != null ? { rowCount: Number(entry.rowCount) } : {}),
      })).filter((entry) => entry.sql.trim());
    }
    return out;
  } catch (err) {
    console.warn('[get-db-info] Oracle SQL history failed:', err);
    return {};
  }
}

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
}

export async function executeGetDbInfo(params: GetDbInfoExecuteParams): Promise<GetDbInfoResult> {
  const { env, definition, agentId, triggerContext, input } = params;
  const config = getDbInfoConfig(definition, agentId);

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
  const { include: includeSqlHistory, limit: historyLimit } = resolveSqlHistorySettings(
    config,
    triggerContext,
    input,
  );

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

  const historyByTable =
    includeSqlHistory && oracleConfig
      ? await fetchSqlHistory({
          oracleConfig,
          tableNames: [tableName],
          limit: historyLimit,
          env,
        })
      : {};
  const sqlHistory = historyByTable[historyKey(tableName)] ?? [];

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

function mappedFormFields(nodeInput: NodeOutput, data: Record<string, unknown>): Record<string, unknown> {
  const item = pipelineItems(nodeInput)[0] ?? asRecord(nodeInput);
  const mapped: Record<string, unknown> = {};
  const user = resolvePipelineField(data.userField || GET_DB_INFO_USER_FIELD, item, nodeInput, []);
  const password = resolvePipelineField(data.passwordField || GET_DB_INFO_PASSWORD_FIELD, item, nodeInput, []);
  const connectString = resolvePipelineField(
    data.connectStringField || GET_DB_INFO_CONNECT_STRING_FIELD,
    item,
    nodeInput,
    [],
  );
  const schemaName = resolvePipelineField(data.schemaNameField, item, nodeInput, []);
  const tableName = resolvePipelineField(data.tableNameField, item, nodeInput, []);
  if (user) {
    mapped.user = user;
    mapped.u = user;
  }
  if (password) {
    mapped.password = password;
    mapped.p = password;
  }
  if (connectString) {
    mapped.connectString = connectString;
    mapped.c = connectString;
  }
  if (schemaName) mapped.schemaName = schemaName;
  if (tableName) mapped.tableName = tableName;
  return mapped;
}

function triggerContextFromNodeInput(nodeInput: NodeOutput, data: Record<string, unknown>): Record<string, unknown> {
  const mapped = mappedFormFields(nodeInput, data);
  const input = asRecord(nodeInput);
  const incomingConnection = asRecord(input.connection);
  const oracleConfig = resolveOracleConnectConfig(mapped) ?? resolveOracleConnectConfig(input);
  const explicitType = String(incomingConnection.type ?? input.connectionType ?? '')
    .trim()
    .toLowerCase();
  const connectionType = oracleConfig ? 'oracle' : explicitType === 'd1' ? 'd1' : '';
  return {
    ...mapped,
    dbId: String(mapped.dbId ?? input.dbId ?? ''),
    databaseId: String(mapped.databaseId ?? input.databaseId ?? ''),
    schemaName: String(mapped.schemaName ?? input.schemaName ?? ''),
    tableName: String(mapped.tableName ?? input.tableName ?? ''),
    tableFilter: String(mapped.tableFilter ?? input.tableFilter ?? '*'),
    connectionType,
    connection: {
      ...(incomingConnection ?? {}),
      ...(oracleConfig
        ? { type: 'oracle', ...oracleConfig }
        : connectionType
          ? { type: connectionType }
          : {}),
    },
    limits: {
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
    ? filterTables([namedTable], tableFilter)
    : await listDatabaseTables(ctx.c.env, connection, schemaName, tableFilter);

  if (!tables.length) {
    throw new Error(
      oracleConfig
        ? `get_db_info: no tables found in Oracle schema ${schemaName} (set tableName on the form, or check the user can see ALL_TABLES)`
        : 'get_db_info: Oracle user, password, and connectString are required from the previous node (map u / p / c). Will not list the platform database.',
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
    limits: {
      sampleRowLimit: data.sampleRowLimit ?? 10,
      sqlHistoryLimit: data.sqlHistoryLimit ?? 10,
    },
    includeSqlHistory: data.includeSqlHistory !== false,
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
