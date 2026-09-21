import type { OracleConnectConfig } from './connect-config.js';
import type { DbColumnInfo, DbForeignKey } from './execute.js';
import {
  oracleProxyConfigured,
  proxyFetchOracleSqlHistories,
  proxyIntrospectOracleTable,
  proxyIntrospectOracleTables,
  proxyListOracleTables,
  type ProxySqlHistoryEntry,
  type ProxyTableIntrospection,
} from './oracle-proxy-client.js';

export type OracleTableIntrospection = {
  tableName: string;
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
  error?: string;
};

function isCloudflareWorkersRuntime(): boolean {
  const g = globalThis as { Cloudflare?: unknown; navigator?: { userAgent?: string } };
  return g.Cloudflare != null || g.navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}

function resolveOraclePath(env?: unknown): 'proxy' | 'direct' {
  if (oracleProxyConfigured(env)) return 'proxy';
  if (isCloudflareWorkersRuntime()) {
    throw new Error(
      'get_db_info: Oracle on Cloudflare Workers requires ORACLE_PROXY_URL (run services/oracle-proxy on OCI/Node)',
    );
  }
  return 'direct';
}

function requireProxyEnv(env: unknown) {
  if (!oracleProxyConfigured(env)) {
    throw new Error('get_db_info: ORACLE_PROXY_URL is not configured');
  }
  return env;
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

export async function listOracleTables(
  config: OracleConnectConfig,
  schemaName: string,
  env?: unknown,
): Promise<string[]> {
  if (resolveOraclePath(env) === 'proxy') {
    return proxyListOracleTables(requireProxyEnv(env), config, schemaName);
  }
  try {
    const { listOracleTablesDirect } = await import('@aiagents-hub/oracle-db');
    return await listOracleTablesDirect(config, schemaName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`get_db_info: Oracle connection failed — ${message}`);
  }
}

export async function introspectOracleTable(
  config: OracleConnectConfig,
  schemaName: string,
  tableName: string,
  sampleLimit: number,
  env?: unknown,
): Promise<{
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
}> {
  if (resolveOraclePath(env) === 'proxy') {
    return proxyIntrospectOracleTable(requireProxyEnv(env), config, schemaName, tableName, sampleLimit);
  }
  try {
    const { introspectOracleTableDirect } = await import('@aiagents-hub/oracle-db');
    return await introspectOracleTableDirect(config, schemaName, tableName, sampleLimit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`get_db_info: Oracle connection failed — ${message}`);
  }
}

function isUnknownProxyAction(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Unknown action/i.test(message);
}

/** One proxy/DB session for many tables. Falls back to per-table calls if the proxy is old. */
export async function introspectOracleTables(
  config: OracleConnectConfig,
  schemaName: string,
  tableNames: string[],
  sampleLimit: number,
  env?: unknown,
): Promise<OracleTableIntrospection[]> {
  const unique = [...new Set(tableNames.map((name) => name.trim()).filter(Boolean))];
  if (!unique.length) return [];

  if (resolveOraclePath(env) === 'proxy') {
    const proxyEnv = requireProxyEnv(env);
    try {
      const rows = await proxyIntrospectOracleTables(proxyEnv, config, schemaName, unique, sampleLimit);
      return rows.map(normalizeProxyTableRow);
    } catch (err) {
      if (!isUnknownProxyAction(err)) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`get_db_info: Oracle connection failed — ${message}`);
      }
      return mapPool(unique, 4, async (tableName) => {
        try {
          const info = await proxyIntrospectOracleTable(proxyEnv, config, schemaName, tableName, sampleLimit);
          return { tableName, ...info };
        } catch (tableErr) {
          const message = tableErr instanceof Error ? tableErr.message : String(tableErr);
          return emptyTableResult(tableName, message);
        }
      });
    }
  }

  try {
    const { introspectOracleTablesDirect } = await import('@aiagents-hub/oracle-db');
    return await introspectOracleTablesDirect(config, schemaName, unique, sampleLimit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`get_db_info: Oracle connection failed — ${message}`);
  }
}

function normalizeProxyTableRow(row: ProxyTableIntrospection): OracleTableIntrospection {
  return {
    tableName: String(row.tableName ?? ''),
    columns: row.columns ?? [],
    primaryKey: row.primaryKey ?? [],
    foreignKeys: row.foreignKeys ?? [],
    ddl: String(row.ddl ?? ''),
    sampleRows: row.sampleRows ?? [],
    rowCountEstimate: row.rowCountEstimate,
    ...(row.error ? { error: row.error } : {}),
  };
}

function emptyTableResult(tableName: string, error: string): OracleTableIntrospection {
  return {
    tableName,
    columns: [],
    primaryKey: [],
    foreignKeys: [],
    ddl: '',
    sampleRows: [],
    error,
  };
}

export async function fetchOracleSqlHistories(
  config: OracleConnectConfig,
  tableNames: string[],
  limit: number,
  env?: unknown,
): Promise<Record<string, ProxySqlHistoryEntry[]>> {
  if (resolveOraclePath(env) === 'proxy') {
    try {
      return await proxyFetchOracleSqlHistories(requireProxyEnv(env), config, tableNames, limit);
    } catch (err) {
      if (isUnknownProxyAction(err)) return {};
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`get_db_info: Oracle connection failed — ${message}`);
    }
  }
  try {
    const { fetchOracleSqlHistoriesDirect } = await import('@aiagents-hub/oracle-db');
    return await fetchOracleSqlHistoriesDirect(config, tableNames, limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`get_db_info: Oracle connection failed — ${message}`);
  }
}
