import type { WorkflowDefinition } from '../../../domain/domain.js';
import {
  introspectTable as introspectOracleTable,
  introspectTables as introspectOracleTables,
  isOracleConnectionType,
  isSystemGeneratedTable,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type DbConnection,
  type GetDbInfoResult,
  type OracleConnectConfig,
} from '../shared/db/index.js';

const RAG_SAMPLE_LIMIT = 3;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
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
    const primaryKey = (pragma.results ?? []).filter((c) => Number(c.pk) > 0).map((c) => c.name);
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

  return {
    dbId,
    schemaName,
    tableName,
    ...introspection,
    sqlHistory: [],
  };
}

export async function introspectTableInfo(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tableName: string;
  schemaName?: string;
}): Promise<GetDbInfoResult> {
  const limits = asRecord(params.triggerContext.limits);
  const sampleLimit = Math.min(
    Number(limits.sampleRowLimit ?? RAG_SAMPLE_LIMIT) || RAG_SAMPLE_LIMIT,
    RAG_SAMPLE_LIMIT,
  );
  const info = await introspectOneTable({
    env: params.env,
    triggerContext: { ...params.triggerContext, tableName: params.tableName },
    tableName: params.tableName,
    schemaName: params.schemaName,
    sampleLimit,
  });
  return truncateSampleRows(info, sampleLimit);
}

/** Batch introspect. Caller runs LLM then builds the schema document. */
export async function introspectTablesInfo(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tables: Array<{ tableName: string; schemaName?: string }>;
}): Promise<GetDbInfoResult[]> {
  const tables = params.tables
    .map((t) => ({
      tableName: String(t.tableName ?? '').trim(),
      schemaName: String(t.schemaName ?? ''),
    }))
    .filter((t) => t.tableName && !isSystemGeneratedTable(t.tableName));
  if (!tables.length) return [];
  if (tables.length === 1) {
    return [await introspectTableInfo({ ...params, ...tables[0]! })];
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
    const out: GetDbInfoResult[] = [];
    for (const row of introspected) {
      if (row.error || !row.columns.length) {
        console.warn(`[save-rag] skip table ${row.tableName}: ${row.error || 'no columns'}`);
        continue;
      }
      out.push(
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
      );
    }
    return out;
  }

  if (connType !== 'd1' && explicitType !== 'd1') {
    throw new Error(
      `save_rag: no database connection for ${tables.length} table(s) (need Oracle user/password/connectString from Form / Get DB Info)`,
    );
  }

  return mapPool(tables, 4, (table) =>
    introspectTableInfo({
      ...params,
      tableName: table.tableName,
      schemaName: table.schemaName,
      triggerContext: { ...params.triggerContext, tableName: table.tableName },
    }),
  );
}

/** @deprecated Prefer introspectTableInfo + describeTable + ragDocumentsFromEnrichment */
export async function introspectTableToRagDocuments(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tableName: string;
  schemaName?: string;
}) {
  const { ragDocumentsFromTableInfo } = await import('./documents.js');
  const info = await introspectTableInfo(params);
  return ragDocumentsFromTableInfo(info);
}

/** @deprecated Prefer introspectTablesInfo + describeTable + ragDocumentsFromEnrichment */
export async function introspectTablesToRagDocuments(params: {
  env: Env;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  tables: Array<{ tableName: string; schemaName?: string }>;
}) {
  const { ragDocumentsFromTableInfo } = await import('./documents.js');
  const infos = await introspectTablesInfo(params);
  return infos.flatMap((info) => ragDocumentsFromTableInfo(info));
}
