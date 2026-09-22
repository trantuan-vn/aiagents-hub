import {
  isOracleConnectionType,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type OracleConnectConfig,
} from './connect-config.js';
import { listTables } from './oracle-client.js';
import type { DbConnection } from './types.js';

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
}

async function listD1Tables(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%$%' ORDER BY name`,
    )
    .all<{ name: string }>();
  return (results ?? []).map((r) => r.name);
}

/** Oracle-generated objects (recycle bin, AQ, MV logs, Text indexes) include `$`. */
export function isSystemGeneratedTable(name: string): boolean {
  return name.includes('$');
}

export function filterTables(tables: string[], tableFilter: string): string[] {
  const realTables = tables.filter((t) => !isSystemGeneratedTable(t));
  const filter = tableFilter.trim();
  if (!filter || filter === '*') return realTables;
  if (filter.includes(',')) {
    const allowed = new Set(filter.split(',').map((s) => s.trim()).filter(Boolean));
    return realTables.filter((t) => allowed.has(t));
  }
  if (filter.includes('*')) {
    const re = new RegExp(`^${filter.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    return realTables.filter((t) => re.test(t));
  }
  return realTables.filter((t) => t === filter);
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
    const tables = await listTables(oracleConfig, owner, env);
    return filterTables(tables, tableFilter);
  }

  if (connection.type === 'd1') {
    const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
    if (!db) return [];
    const tables = await listD1Tables(db);
    return filterTables(tables, tableFilter);
  }

  throw new Error(
    'get_db_info: Oracle user, password, and connectString are required from the previous node (map u / p / c). Will not list the platform database.',
  );
}
