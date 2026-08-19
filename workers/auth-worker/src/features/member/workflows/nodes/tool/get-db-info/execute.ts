import { resolveCredential } from '../../../storage/credentials.js';
import { toolNodeConfig } from '../shared/rag-context.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import {
  isOracleConnectionType,
  pickUpstreamString,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type OracleConnectConfig,
} from './connect-config.js';
import { ragDocumentsFromDbInfo } from './documents.js';
import { introspectOracleTable, listOracleTables } from './oracle.js';

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

  const connType = String(
    connection.type ?? triggerContext.connectionType ?? (oracleConfig ? 'oracle' : 'd1'),
  );

  let introspection: Omit<GetDbInfoResult, 'dbId' | 'schemaName' | 'tableName' | 'sqlHistory'>;

  if (oracleConfig || isOracleConnectionType(connType)) {
    if (!oracleConfig) {
      throw new Error(
        'get_db_info: Oracle user, password, and connectString are required from the previous node',
      );
    }
    introspection = await introspectOracleTable(oracleConfig, schemaName, tableName, sampleLimit, env);
  } else if (connType === 'd1') {
    const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (!db) throw new Error('get_db_info: D1 binding not configured');
    introspection = await introspectD1Table(db, tableName, sampleLimit);
  } else {
    const credentialKey = String(connection.credentialKey ?? triggerContext.credentialKey ?? '');
    if (credentialKey) {
      try {
        await resolveCredential(
          {} as DurableObjectStub<UserDO>,
          env,
          credentialKey,
        );
      } catch {
        /* credential optional for D1 fallback */
      }
    }
    const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (db) {
      introspection = await introspectD1Table(db, tableName, sampleLimit);
    } else {
      throw new Error(`get_db_info: unsupported connection type "${connType}"`);
    }
  }

  const sqlHistory =
    config.includeSqlHistory !== false
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

/** Graph-path execute: introspect table(s) and emit RAG documents as loop `items`. */
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
  const sampleLimit = Math.min(Number(triggerContext.limits?.sampleRowLimit ?? 3), 5);
  const infos: GetDbInfoResult[] = [];
  for (const tableName of selected) {
    infos.push(
      await executeGetDbInfo({
        env: ctx.c.env,
        definition: ctx.definition,
        agentId: ctx.node.id,
        triggerContext: { ...triggerContext, tableName },
        input: { tableName, schemaName, sampleRowLimit: sampleLimit },
      }),
    );
  }

  for (const info of infos) {
    info.sampleRows = info.sampleRows.slice(0, sampleLimit).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v;
      }
      return out;
    });
  }

  const items = infos.flatMap((info) => ragDocumentsFromDbInfo(info));
  return {
    dbId: String(triggerContext.dbId ?? ''),
    schemaName,
    tableName: namedTable || selected.join(','),
    tables,
    items,
    count: items.length,
    tableCount: selected.length,
  };
}
