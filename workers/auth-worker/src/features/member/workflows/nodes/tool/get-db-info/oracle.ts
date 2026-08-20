import type { OracleConnectConfig } from './connect-config.js';
import type { DbColumnInfo, DbForeignKey } from './execute.js';
import {
  oracleProxyConfigured,
  proxyIntrospectOracleTable,
  proxyIntrospectOracleTables,
  proxyListOracleTables,
  type ProxyTableIntrospection,
} from './oracle-proxy-client.js';

type OracleEnv = {
  ORACLE_PROXY_URL?: string;
  ORACLE_PROXY_SECRET?: string;
};

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

function resolveOraclePath(env?: OracleEnv): 'proxy' | 'direct' {
  if (env && oracleProxyConfigured(env)) return 'proxy';
  if (isCloudflareWorkersRuntime()) {
    throw new Error(
      'get_db_info: Oracle on Cloudflare Workers requires ORACLE_PROXY_URL (run services/oracle-proxy on OCI/Node)',
    );
  }
  return 'direct';
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
  env?: OracleEnv,
): Promise<string[]> {
  if (resolveOraclePath(env) === 'proxy') {
    return proxyListOracleTables(env!, config, schemaName);
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
  env?: OracleEnv,
): Promise<{
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
}> {
  if (resolveOraclePath(env) === 'proxy') {
    return proxyIntrospectOracleTable(env!, config, schemaName, tableName, sampleLimit);
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
  env?: OracleEnv,
): Promise<OracleTableIntrospection[]> {
  const unique = [...new Set(tableNames.map((name) => name.trim()).filter(Boolean))];
  if (!unique.length) return [];

  if (resolveOraclePath(env) === 'proxy') {
    try {
      const rows = await proxyIntrospectOracleTables(env!, config, schemaName, unique, sampleLimit);
      return rows.map(normalizeProxyTableRow);
    } catch (err) {
      if (!isUnknownProxyAction(err)) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`get_db_info: Oracle connection failed — ${message}`);
      }
      return mapPool(unique, 4, async (tableName) => {
        try {
          const info = await proxyIntrospectOracleTable(env!, config, schemaName, tableName, sampleLimit);
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
