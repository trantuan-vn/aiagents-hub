import type { WorkflowDefinition } from '../../../domain/domain.js';
import {
  fetchSqlHistory as fetchOracleSqlHistories,
  introspectTable as introspectOracleTable,
  introspectTables as introspectOracleTables,
  isOracleConnectionType,
  isSystemGeneratedTable,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type DbConnection,
  type GetDbInfoResult,
  type OracleConnectConfig,
  type SqlHistoryEntry,
} from '../shared/db/index.js';
import { toolNodeConfig } from '../shared/rag-context.js';
import { ragDocumentsFromDbInfo, type RagDocumentItem } from './documents.js';

const RAG_SAMPLE_LIMIT = 3;
const SQL_HISTORY_LIMIT_DEFAULT = 10;
const SQL_HISTORY_LIMIT_MAX = 50;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function historyKey(tableName: string): string {
  return tableName.trim().toUpperCase();
}

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
}

/** Prefer Get DB Info node settings when present so ingest limits stay consistent. */
function resolveHistoryConfig(definition: WorkflowDefinition, hostId: string): Record<string, unknown> {
  const linked = toolNodeConfig(definition, hostId, 'get-db-info');
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
): { include: boolean; limit: number } {
  const limits = asRecord(triggerContext.limits);
  const include = config.includeSqlHistory !== false;
  const raw = config.sqlHistoryLimit ?? limits.sqlHistoryLimit ?? SQL_HISTORY_LIMIT_DEFAULT;
  const parsed = Number(raw);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(0, Math.floor(parsed)), SQL_HISTORY_LIMIT_MAX)
    : SQL_HISTORY_LIMIT_DEFAULT;
  return { include, limit };
}

async function loadSqlHistory(params: {
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
      out[historyKey(table)] = (entries ?? [])
        .map((entry) => ({
          sql: String(entry.sql ?? ''),
          ...(entry.executedAt ? { executedAt: String(entry.executedAt) } : {}),
          ...(entry.durationMs != null ? { durationMs: Number(entry.durationMs) } : {}),
          ...(entry.rowCount != null ? { rowCount: Number(entry.rowCount) } : {}),
        }))
        .filter((entry) => entry.sql.trim());
    }
    return out;
  } catch (err) {
    console.warn('[save-rag] Oracle SQL history failed:', err);
    return {};
  }
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

async function introspectOneTable(params: {
  env: Env;
  triggerContext: Record<string, unknown>;
  tableName: string;
  schemaName?: string;
  sampleLimit: number;
  sqlHistoryLimit: number;
  includeSqlHistory: boolean;
}): Promise<GetDbInfoResult> {
  const connection = (params.triggerContext.connection ?? {}) as DbConnection;
  const oracleConfig = oracleConfigFrom(params.triggerContext, connection);
  const dbId = String(params.triggerContext.dbId ?? params.triggerContext.databaseId ?? '');
  const tableName = params.tableName;
  if (!tableName) throw new Error('save_rag: tableName is required');

  const requestedSchema = params.schemaName ?? String(params.triggerContext.schemaName ?? 'public');
  const schemaName = oracleConfig
    ? resolveOracleSchema(requestedSchema, oracleConfig.user)
    : requestedSchema;

  const explicitType = String(connection.type ?? params.triggerContext.connectionType ?? '')
    .trim()
    .toLowerCase();
  const connType = explicitType || (oracleConfig ? 'oracle' : '');

  let introspection: Omit<GetDbInfoResult, 'dbId' | 'schemaName' | 'tableName' | 'sqlHistory'>;

  if (oracleConfig || isOracleConnectionType(connType)) {
    if (!oracleConfig) {
      throw new Error(
        'save_rag: Oracle user, password, and connectString are required from the previous node',
      );
    }
    introspection = await introspectOracleTable(
      oracleConfig,
      schemaName,
      tableName,
      params.sampleLimit,
      params.env,
    );
  } else if (connType === 'd1' || explicitType === 'd1') {
    const db = (params.env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (!db) throw new Error('save_rag: D1 binding not configured');
    const safeTable = tableName.replace(/"/g, '""');
    const pragma = await db.prepare(`PRAGMA table_info("${safeTable}")`).all<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk?: number;
    }>();
    const columns = (pragma.results ?? []).map((col) => ({
      name: col.name,
      type: col.type || 'TEXT',
      nullable: col.notnull === 0,
      default: col.dflt_value ?? undefined,
    }));
    const primaryKey = (pragma.results ?? [])
      .filter((c) => Number(c.pk) > 0)
      .map((c) => c.name);
    const fkRows = await db.prepare(`PRAGMA foreign_key_list("${safeTable}")`).all<{
      from: string;
      table: string;
      to: string;
    }>();
    const foreignKeys = (fkRows.results ?? []).map((fk) => ({
      column: fk.from,
      refTable: fk.table,
      refColumn: fk.to,
    }));
    const ddlParts = columns.map(
      (c) =>
        `"${c.name}" ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.default != null ? ` DEFAULT ${c.default}` : ''}`,
    );
    const sample = await db
      .prepare(`SELECT * FROM "${safeTable}" LIMIT ?`)
      .bind(params.sampleLimit)
      .all<Record<string, unknown>>();
    const countRow = await db
      .prepare(`SELECT COUNT(*) as cnt FROM "${safeTable}"`)
      .first<{ cnt: number }>();
    introspection = {
      columns,
      primaryKey,
      foreignKeys,
      ddl: `CREATE TABLE "${safeTable}" (\n  ${ddlParts.join(',\n  ')}\n);`,
      sampleRows: sample.results ?? [],
      rowCountEstimate: countRow?.cnt,
    };
  } else {
    throw new Error(
      `save_rag: no database connection for table "${tableName}" (need Oracle user/password/connectString or connection.type=d1)`,
    );
  }

  const historyByTable =
    params.includeSqlHistory && oracleConfig
      ? await loadSqlHistory({
          oracleConfig,
          tableNames: [tableName],
          limit: params.sqlHistoryLimit,
          env: params.env,
        })
      : {};

  return {
    dbId,
    schemaName,
    tableName,
    ...introspection,
    sqlHistory: historyByTable[historyKey(tableName)] ?? [],
  };
}

/** Introspect one table and emit schema + sqlexample documents. */
export async function introspectTableToRagDocuments(params: {
  env: Env;
  definition: WorkflowDefinition;
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
  const config = resolveHistoryConfig(params.definition, params.agentId);
  const { include: includeSqlHistory, limit: sqlHistoryLimit } = resolveSqlHistorySettings(
    config,
    params.triggerContext,
  );
  const info = await introspectOneTable({
    env: params.env,
    triggerContext: { ...params.triggerContext, tableName: params.tableName },
    tableName: params.tableName,
    schemaName: params.schemaName,
    sampleLimit,
    sqlHistoryLimit,
    includeSqlHistory,
  });
  return ragDocumentsFromDbInfo(truncateSampleRows(info, sampleLimit));
}

/** Batch-introspect many tables for RAG (one Oracle session when possible). */
export async function introspectTablesToRagDocuments(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tables: Array<{ tableName: string; schemaName?: string }>;
}): Promise<RagDocumentItem[]> {
  const tables = params.tables
    .map((t) => ({
      tableName: String(t.tableName ?? '').trim(),
      schemaName: String(t.schemaName ?? ''),
    }))
    .filter((t) => t.tableName && !isSystemGeneratedTable(t.tableName));
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
        'save_rag: Oracle user, password, and connectString are required from the previous node',
      );
    }
    const schemaName = resolveOracleSchema(tables[0]!.schemaName, oracleConfig.user);
    const tableNames = tables.map((t) => t.tableName);
    const introspected = await introspectOracleTables(
      oracleConfig,
      schemaName,
      tableNames,
      sampleLimit,
      params.env,
    );
    const config = resolveHistoryConfig(params.definition, params.agentId);
    const { include: includeSqlHistory, limit: sqlHistoryLimit } = resolveSqlHistorySettings(
      config,
      params.triggerContext,
    );
    const historyByTable = includeSqlHistory
      ? await loadSqlHistory({
          oracleConfig,
          tableNames,
          limit: sqlHistoryLimit,
          env: params.env,
        })
      : {};
    const docs: RagDocumentItem[] = [];
    for (const row of introspected) {
      if (row.error || !row.columns.length) {
        console.warn(`[save-rag] skip table ${row.tableName}: ${row.error || 'no columns'}`);
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
              sqlHistory: historyByTable[historyKey(row.tableName)] ?? [],
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
      `save_rag: no database connection for ${tables.length} table(s) (need Oracle user/password/connectString from Form / Get DB Info)`,
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
