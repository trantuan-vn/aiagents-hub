import type { Connection } from 'oracledb';   

import type { DbColumnInfo, DbForeignKey, OracleConnectConfig } from './types.js';

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
      `SELECT table_name FROM all_tables WHERE owner = :owner ORDER BY table_name`,
      { owner },
      oracledb.OUT_FORMAT_OBJECT,
      2000,
    );
    return rows.map((row) => rowStr(row, 'TABLE_NAME')).filter(Boolean);
  });
}

export async function introspectOracleTableDirect(
  config: OracleConnectConfig,
  schemaName: string,
  tableName: string,
  sampleLimit: number,
): Promise<{
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
}> {
  const owner = oracleName(schemaName);
  const table = oracleName(tableName);
  const qualified = `${quoteIdent(owner)}.${quoteIdent(table)}`;
  const limit = Math.min(Math.max(1, Math.floor(sampleLimit) || 10), 100);

  return withOracleConnection(config, async (connection, oracledb) => {
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

    const countRows = await executeRows(
      connection,
      `SELECT COUNT(*) AS cnt FROM ${qualified}`,
      {},
      outFormat,
      1,
    );
    const rowCountEstimate = Number(rowVal(countRows[0] ?? {}, 'CNT'));

    return {
      columns,
      primaryKey,
      foreignKeys,
      ddl,
      sampleRows,
      rowCountEstimate: Number.isFinite(rowCountEstimate) ? rowCountEstimate : undefined,
    };
  });
}
