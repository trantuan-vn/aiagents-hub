import type { Connection } from 'oracledb';   

import type { DbColumnInfo, DbForeignKey, OracleConnectConfig, OracleSqlHistoryEntry } from './types.js';

type OracleDbApi = typeof import('oracledb').default;

async function loadOracleDb(): Promise<OracleDbApi> {
  const mod = await import('oracledb');
  return (mod as { default?: OracleDbApi }).default ?? (mod as unknown as OracleDbApi);
}

function rowVal(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? row[found] : undefined;
}

function rowStr(row: Record<string, unknown>, key: string): string {
  const value = rowVal(row, key);
  return value == null ? '' : String(value);
}

function stripOracleValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(stripOracleValue);
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name ?? '';
  if (ctor && ctor !== 'Object' && ctor !== 'Date') return String(value);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = stripOracleValue((value as Record<string, unknown>)[k]);
  }
  return out;
}

function asRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => {
      const plain: Record<string, unknown> = {};
      for (const key of Object.keys(row)) plain[key] = stripOracleValue(row[key]);
      return plain;
    });
}

function oracleName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed.toUpperCase();
}

function quoteIdent(name: string): string {
  const id = oracleName(name);
  if (!id || id.length > 128 || /[\0\n\r;]/.test(id)) {
    throw new Error(`invalid Oracle identifier "${name}"`);
  }
  return `"${id.replace(/"/g, '""')}"`;
}

function formatOracleType(row: Record<string, unknown>): string {
  const type = rowStr(row, 'DATA_TYPE') || 'VARCHAR2';
  const length = rowVal(row, 'DATA_LENGTH');
  const precision = rowVal(row, 'DATA_PRECISION');
  const scale = rowVal(row, 'DATA_SCALE');
  if (type === 'NUMBER' && precision != null && String(precision).trim() !== '') {
    return scale != null && String(scale).trim() !== ''
      ? `NUMBER(${precision},${scale})`
      : `NUMBER(${precision})`;
  }
  if ((type === 'VARCHAR2' || type === 'NVARCHAR2' || type === 'CHAR' || type === 'NCHAR') && length != null) {
    return `${type}(${length})`;
  }
  return type;
}

function normalizeOracleValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value === 'object') {
    try {
      JSON.stringify(value);
      return value;
    } catch {
      return String(value);
    }
  }
  return value;
}

async function executeRows(
  connection: Connection,
  sql: string,
  binds: Record<string, unknown>,
  outFormat: number,
  maxRows?: number,
): Promise<Record<string, unknown>[]> {
  const result = await connection.execute(sql, binds, {
    outFormat,
    ...(maxRows != null ? { maxRows } : {}),
  });
  return asRows(result.rows);
}

/** Per round-trip Oracle call timeout (ms). Override with ORACLE_CALL_TIMEOUT_MS. */
const DEFAULT_CALL_TIMEOUT_MS = 50_000;
const MAX_CALL_TIMEOUT_MS = 110_000;

function resolveCallTimeoutMs(): number {
  const env =
    typeof process !== 'undefined' && process.env ? process.env : ({} as Record<string, string | undefined>);
  const raw = Number(env.ORACLE_CALL_TIMEOUT_MS ?? DEFAULT_CALL_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_CALL_TIMEOUT_MS;
  if (raw === 0) return 0;
  return Math.min(MAX_CALL_TIMEOUT_MS, Math.floor(raw));
}

/** Same as OCI sample: `oracledb.getConnection({ user, password, connectString })`. */
export async function withOracleConnection<T>(
  config: OracleConnectConfig,
  fn: (connection: Connection, oracledb: OracleDbApi) => Promise<T>,
): Promise<T> {
  const oracledb = await loadOracleDb();
  let connection: Connection | undefined;
  try {
    connection = await oracledb.getConnection({
      user: config.user,
      password: config.password,
      connectString: config.connectString,
      ...(config.configDir ? { configDir: config.configDir } : {}),
      ...(config.walletLocation ? { walletLocation: config.walletLocation } : {}),
      ...(config.walletPassword ? { walletPassword: config.walletPassword } : {}),
    });
    const callTimeoutMs = resolveCallTimeoutMs();
    if (callTimeoutMs > 0) {
      (connection as Connection & { callTimeout?: number }).callTimeout = callTimeoutMs;
    }
    return await fn(connection, oracledb);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function listOracleTablesDirect(
  config: OracleConnectConfig,
  schemaName: string,
): Promise<string[]> {
  return withOracleConnection(config, async (connection, oracledb) => {
    const owner = oracleName(schemaName);
    const rows = await executeRows(
      connection,
      `SELECT table_name FROM all_tables
        WHERE owner = :owner
          AND table_name NOT LIKE '%$%'
        ORDER BY table_name`,
      { owner },
      oracledb.OUT_FORMAT_OBJECT,
      2000,
    );
    return rows.map((row) => rowStr(row, 'TABLE_NAME')).filter(Boolean);
  });
}

export type OracleTableIntrospectResult = {
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
};

export type OracleTablesIntrospectResult = OracleTableIntrospectResult & {
  tableName: string;
  error?: string;
};

async function fetchNumRowsEstimates(
  connection: Connection,
  oracledb: OracleDbApi,
  owner: string,
  tables: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!tables.length) return out;
  const binds: Record<string, string> = { owner };
  const placeholders = tables.map((table, i) => {
    binds[`t${i}`] = table;
    return `:t${i}`;
  });
  const rows = await executeRows(
    connection,
    `SELECT table_name, num_rows FROM all_tables
      WHERE owner = :owner AND table_name IN (${placeholders.join(', ')})`,
    binds,
    oracledb.OUT_FORMAT_OBJECT,
  );
  for (const row of rows) {
    const name = rowStr(row, 'TABLE_NAME');
    const num = Number(rowVal(row, 'NUM_ROWS'));
    if (name && Number.isFinite(num)) out.set(name, num);
  }
  return out;
}

async function introspectOracleTableOnConnection(
  connection: Connection,
  oracledb: OracleDbApi,
  schemaName: string,
  tableName: string,
  sampleLimit: number,
  rowCountEstimate?: number,
): Promise<OracleTableIntrospectResult> {
  const owner = oracleName(schemaName);
  const table = oracleName(tableName);
  const qualified = `${quoteIdent(owner)}.${quoteIdent(table)}`;
  const limit = Math.min(Math.max(1, Math.floor(sampleLimit) || 10), 100);
  const outFormat = oracledb.OUT_FORMAT_OBJECT;
  const binds = { owner, table_name: table };

  const columnRows = await executeRows(
    connection,
    `SELECT c.column_name, c.data_type, c.data_length, c.data_precision, c.data_scale,
            c.nullable, c.column_id, cc.comments
       FROM all_tab_columns c
       LEFT JOIN all_col_comments cc
         ON cc.owner = c.owner AND cc.table_name = c.table_name AND cc.column_name = c.column_name
      WHERE c.owner = :owner AND c.table_name = :table_name
      ORDER BY c.column_id`,
    binds,
    outFormat,
  );

  let defaults: Record<string, string> = {};
  try {
    const defRows = await executeRows(
      connection,
      `SELECT column_name, data_default FROM user_tab_columns WHERE table_name = :table_name AND data_default IS NOT NULL`,
      { table_name: table },
      outFormat,
    );
    for (const row of defRows) {
      const col = rowStr(row, 'COLUMN_NAME');
      const def = rowStr(row, 'DATA_DEFAULT').trim();
      if (col && def) defaults[col] = def.length > 200 ? def.slice(0, 200) + '…' : def;
    }
  } catch {
    /* LONG fetch may fail on some configs — skip defaults */
  }

  if (!columnRows.length) {
    throw new Error(`Oracle table ${owner}.${table} not found`);
  }

  const columns: DbColumnInfo[] = columnRows.map((row) => {
    const colName = rowStr(row, 'COLUMN_NAME');
    const def = defaults[colName] ?? null;
    const comment = rowStr(row, 'COMMENTS');
    return {
      name: colName,
      type: formatOracleType(row),
      nullable: rowStr(row, 'NULLABLE') !== 'N',
      ...(def ? { default: def } : {}),
      ...(comment ? { comment } : {}),
    };
  });

  const pkRows = await executeRows(
    connection,
    `SELECT a.column_name
       FROM all_cons_columns a
       JOIN all_constraints c
         ON a.constraint_name = c.constraint_name AND a.owner = c.owner
      WHERE c.constraint_type = 'P'
        AND c.owner = :owner AND c.table_name = :table_name
      ORDER BY a.position`,
    binds,
    outFormat,
  );
  const primaryKey = pkRows.map((row) => rowStr(row, 'COLUMN_NAME')).filter(Boolean);

  const fkRows = await executeRows(
    connection,
    `SELECT a.column_name, p.table_name AS ref_table, b.column_name AS ref_column
       FROM all_cons_columns a
       JOIN all_constraints c
         ON a.constraint_name = c.constraint_name AND a.owner = c.owner
       JOIN all_constraints p
         ON c.r_constraint_name = p.constraint_name AND c.r_owner = p.owner
       JOIN all_cons_columns b
         ON p.constraint_name = b.constraint_name AND p.owner = b.owner
        AND a.position = b.position
      WHERE c.constraint_type = 'R'
        AND c.owner = :owner AND c.table_name = :table_name
      ORDER BY a.position`,
    binds,
    outFormat,
  );
  const foreignKeys: DbForeignKey[] = fkRows.map((row) => ({
    column: rowStr(row, 'COLUMN_NAME'),
    refTable: rowStr(row, 'REF_TABLE'),
    refColumn: rowStr(row, 'REF_COLUMN'),
  }));

  const ddlParts = columns.map(
    (c) =>
      `"${c.name}" ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.default != null ? ` DEFAULT ${c.default}` : ''}`,
  );
  const ddl = `CREATE TABLE ${qualified} (\n  ${ddlParts.join(',\n  ')}\n);`;

  const SKIP_TYPES = new Set(['CLOB', 'NCLOB', 'BLOB', 'BFILE', 'LONG', 'LONG RAW', 'VECTOR']);
  const sampleCols = columns.filter((c) => !SKIP_TYPES.has(c.type.split('(')[0].toUpperCase()));
  const selectList = sampleCols.length
    ? sampleCols.map((c) => quoteIdent(c.name)).join(', ')
    : '*';
  const sampleRaw = await executeRows(
    connection,
    `SELECT ${selectList} FROM ${qualified} FETCH FIRST ${limit} ROWS ONLY`,
    {},
    outFormat,
    limit,
  );
  const sampleRows = sampleRaw.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = normalizeOracleValue(value);
    return out;
  });

  return {
    columns,
    primaryKey,
    foreignKeys,
    ddl,
    sampleRows,
    rowCountEstimate,
  };
}

export async function introspectOracleTableDirect(
  config: OracleConnectConfig,
  schemaName: string,
  tableName: string,
  sampleLimit: number,
): Promise<OracleTableIntrospectResult> {
  const owner = oracleName(schemaName);
  const table = oracleName(tableName);
  return withOracleConnection(config, async (connection, oracledb) => {
    const estimates = await fetchNumRowsEstimates(connection, oracledb, owner, [table]);
    return introspectOracleTableOnConnection(
      connection,
      oracledb,
      schemaName,
      tableName,
      sampleLimit,
      estimates.get(table),
    );
  });
}

/** One Oracle session for many tables — avoids reconnect + COUNT(*) full scans. */
export async function introspectOracleTablesDirect(
  config: OracleConnectConfig,
  schemaName: string,
  tableNames: string[],
  sampleLimit: number,
): Promise<OracleTablesIntrospectResult[]> {
  const unique = [...new Set(tableNames.map(oracleName).filter(Boolean))];
  if (!unique.length) return [];
  const owner = oracleName(schemaName);

  return withOracleConnection(config, async (connection, oracledb) => {
    const estimates = await fetchNumRowsEstimates(connection, oracledb, owner, unique);
    const results: OracleTablesIntrospectResult[] = [];
    for (const table of unique) {
      try {
        const info = await introspectOracleTableOnConnection(
          connection,
          oracledb,
          schemaName,
          table,
          sampleLimit,
          estimates.get(table),
        );
        results.push({ tableName: table, ...info });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          tableName: table,
          columns: [],
          primaryKey: [],
          foreignKeys: [],
          ddl: '',
          sampleRows: [],
          error: message,
        });
      }
    }
    return results;
  });
}

const EXECUTION_HISTORY_OWNER = 'ADMIN';
const EXECUTION_HISTORY_TABLE = 'DBTOOLS$EXECUTION_HISTORY';
const SQL_HISTORY_TEXT_MAX = 4000;

type ExecutionHistoryColumns = {
  sqlExpr: string;
  orderExpr: string;
  executedAtIdent?: string;
};

async function resolveExecutionHistoryColumns(
  connection: Connection,
  oracledb: OracleDbApi,
): Promise<ExecutionHistoryColumns | null> {
  const rows = await executeRows(
    connection,
    `SELECT column_name, data_type FROM all_tab_columns
      WHERE owner = :owner AND table_name = :table_name`,
    { owner: EXECUTION_HISTORY_OWNER, table_name: EXECUTION_HISTORY_TABLE },
    oracledb.OUT_FORMAT_OBJECT,
  );
  if (!rows.length) return null;

  const byName = new Map(
    rows.map((row) => [rowStr(row, 'COLUMN_NAME').toUpperCase(), rowStr(row, 'DATA_TYPE').toUpperCase()]),
  );
  const sqlCol = ['STATEMENT', 'SQL_TEXT', 'SQL', 'TEXT'].find((name) => byName.has(name));
  if (!sqlCol) return null;

  const sqlType = byName.get(sqlCol) ?? '';
  const sqlIdent = quoteIdent(sqlCol);
  const sqlExpr = /CLOB|NCLOB|LOB/.test(sqlType)
    ? `DBMS_LOB.SUBSTR(${sqlIdent}, ${SQL_HISTORY_TEXT_MAX}, 1)`
    : `SUBSTR(${sqlIdent}, 1, ${SQL_HISTORY_TEXT_MAX})`;

  const executedAtCol = ['UPDATED', 'LAST_UPDATED', 'CREATED', 'CREATED_ON', 'LAST_ACTIVE'].find((name) =>
    byName.has(name),
  );
  const orderCol = executedAtCol ?? ['ID', 'HASH'].find((name) => byName.has(name));
  return {
    sqlExpr,
    orderExpr: orderCol ? `${quoteIdent(orderCol)} DESC` : `${sqlExpr} DESC`,
    ...(executedAtCol ? { executedAtIdent: quoteIdent(executedAtCol) } : {}),
  };
}

function historyEntryFromRow(row: Record<string, unknown>): OracleSqlHistoryEntry | null {
  const sql = rowStr(row, 'SQL_TEXT').trim();
  if (!sql) return null;
  const executedAt = rowStr(row, 'EXECUTED_AT').trim();
  return {
    sql,
    ...(executedAt ? { executedAt } : {}),
  };
}

async function fetchSqlHistoryForTable(
  connection: Connection,
  oracledb: OracleDbApi,
  columns: ExecutionHistoryColumns,
  tableName: string,
  limit: number,
): Promise<OracleSqlHistoryEntry[]> {
  const table = oracleName(tableName);
  if (!table) return [];
  const selectTime = columns.executedAtIdent
    ? `, ${columns.executedAtIdent} AS executed_at`
    : ', NULL AS executed_at';
  const rows = await executeRows(
    connection,
    `SELECT ${columns.sqlExpr} AS sql_text${selectTime}
       FROM ${quoteIdent(EXECUTION_HISTORY_OWNER)}.${quoteIdent(EXECUTION_HISTORY_TABLE)}
      WHERE UPPER(${columns.sqlExpr}) LIKE :pattern
      ORDER BY ${columns.orderExpr}
      FETCH FIRST ${limit} ROWS ONLY`,
    { pattern: `%${table}%` },
    oracledb.OUT_FORMAT_OBJECT,
    limit,
  );
  return rows.map(historyEntryFromRow).filter((entry): entry is OracleSqlHistoryEntry => entry != null);
}

/** SQL Developer Web / Database Actions history: ADMIN.DBTOOLS$EXECUTION_HISTORY. */
export async function fetchOracleSqlHistoriesDirect(
  config: OracleConnectConfig,
  tableNames: string[],
  limit: number,
): Promise<Record<string, OracleSqlHistoryEntry[]>> {
  const unique = [...new Set(tableNames.map(oracleName).filter(Boolean))];
  const empty = Object.fromEntries(unique.map((table) => [table, [] as OracleSqlHistoryEntry[]]));
  const capped = Math.min(Math.max(0, Math.floor(limit) || 0), 50);
  if (!unique.length || capped <= 0) return empty;

  return withOracleConnection(config, async (connection, oracledb) => {
    let columns: ExecutionHistoryColumns | null;
    try {
      columns = await resolveExecutionHistoryColumns(connection, oracledb);
    } catch {
      return empty;
    }
    if (!columns) return empty;

    const out: Record<string, OracleSqlHistoryEntry[]> = { ...empty };
    for (const table of unique) {
      try {
        out[table] = await fetchSqlHistoryForTable(connection, oracledb, columns, table, capped);
      } catch {
        out[table] = [];
      }
    }
    return out;
  });
}

function clampQueryMaxRows(maxRows: number): number {
  return Math.min(20, Math.max(1, Math.floor(maxRows) || 5));
}

/** Wrap user SELECT/WITH so Oracle stops after maxRows (worker never sees a full scan). */
export function wrapReadOnlyProbeSql(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const limit = clampQueryMaxRows(maxRows);
  return `SELECT * FROM (${trimmed})\n__check_sql_probe FETCH FIRST ${limit} ROWS ONLY`;
}

export type OracleQueryOk = {
  ok: true;
  columns: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  elapsedMs: number;
  /** True when only EXPLAIN PLAN / parse ran — no row fetch. */
  validatedOnly?: boolean;
};

export type OracleQueryErr = {
  ok: false;
  error: string;
  oracleCode?: string;
};

export type OracleQueryResult = OracleQueryOk | OracleQueryErr;

function oracleErrorResult(err: unknown): OracleQueryErr {
  const message = err instanceof Error ? err.message : String(err);
  const code = /ORA-\d+/i.exec(message)?.[0]?.toUpperCase();
  return {
    ok: false,
    error: message.slice(0, 1000),
    ...(code ? { oracleCode: code } : {}),
  };
}

/**
 * Probe a read-only SELECT/WITH. Oracle errors return `{ ok: false }` (no throw).
 * Connection failures still throw.
 */
export async function executeOracleQueryDirect(
  config: OracleConnectConfig,
  sql: string,
  maxRows = 5,
): Promise<OracleQueryResult> {
  const limit = clampQueryMaxRows(maxRows);
  const t0 = Date.now();
  return withOracleConnection(config, async (connection, oracledb) => {
    try {
      const wrapped = wrapReadOnlyProbeSql(sql, limit);
      const result = await connection.execute(wrapped, {}, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: limit,
      });
      const sampleRows = asRows(result.rows);
      const metaNames = Array.isArray(result.metaData)
        ? result.metaData
            .map((m) => {
              if (m && typeof m === 'object' && 'name' in m) return String((m as { name?: unknown }).name ?? '');
              return '';
            })
            .filter(Boolean)
        : [];
      const columns = metaNames.length ? metaNames : sampleRows[0] ? Object.keys(sampleRows[0]) : [];
      return {
        ok: true,
        columns,
        rowCount: sampleRows.length,
        sampleRows,
        elapsedMs: Date.now() - t0,
      };
    } catch (err) {
      return oracleErrorResult(err);
    }
  });
}

/**
 * Validate SQL without fetching rows: `EXPLAIN PLAN FOR <sql>`.
 * Optionally `ALTER SESSION SET CURRENT_SCHEMA` so unqualified names resolve.
 */
export async function validateOracleQueryDirect(
  config: OracleConnectConfig,
  sql: string,
  schemaName?: string,
): Promise<OracleQueryResult> {
  const t0 = Date.now();
  return withOracleConnection(config, async (connection) => {
    try {
      const schema = String(schemaName ?? '').trim().toUpperCase();
      if (schema && /^[A-Z][A-Z0-9_$#]*$/.test(schema)) {
        await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`, {}, {
          autoCommit: false,
        });
      }
      const trimmed = String(sql ?? '').trim().replace(/;+\s*$/, '');
      await connection.execute(`EXPLAIN PLAN FOR\n${trimmed}`, {}, {
        autoCommit: false,
      });
      return {
        ok: true,
        columns: [],
        rowCount: 0,
        sampleRows: [],
        elapsedMs: Date.now() - t0,
        validatedOnly: true,
      };
    } catch (err) {
      return oracleErrorResult(err);
    }
  });
}
