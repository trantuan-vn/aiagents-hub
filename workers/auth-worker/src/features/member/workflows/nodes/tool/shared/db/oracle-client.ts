import type { OracleConnectConfig } from './connect-config.js';
import type { OracleQueryResult } from '@aiagents-hub/oracle-db';
import {
  oracleProxyConfigured,
  proxyExecuteOracleQuery,
} from './oracle-proxy-client.js';

export {
  fetchOracleSqlHistories as fetchSqlHistory,
  introspectOracleTable as introspectTable,
  introspectOracleTables as introspectTables,
  listOracleTables as listTables,
} from './oracle.js';

function isCloudflareWorkersRuntime(): boolean {
  const g = globalThis as { Cloudflare?: unknown; navigator?: { userAgent?: string } };
  return g.Cloudflare != null || g.navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}

function resolveOraclePath(env?: unknown): 'proxy' | 'direct' {
  if (oracleProxyConfigured(env)) return 'proxy';
  if (isCloudflareWorkersRuntime()) {
    throw new Error(
      'check_sql: Oracle on Cloudflare Workers requires ORACLE_PROXY_URL (run services/oracle-proxy on OCI/Node)',
    );
  }
  return 'direct';
}

function requireProxyEnv(env: unknown) {
  if (!oracleProxyConfigured(env)) {
    throw new Error('check_sql: ORACLE_PROXY_URL is not configured');
  }
  return env;
}

export type ExecuteReadOnlyParams = {
  config: OracleConnectConfig;
  sql: string;
  maxRows?: number;
  env?: unknown;
};

/** Phase 4 — Check SQL only. Returns structured ok/error; does not throw on ORA-*. */
export async function executeReadOnly(params: ExecuteReadOnlyParams): Promise<OracleQueryResult> {
  const maxRows = params.maxRows ?? 5;
  if (resolveOraclePath(params.env) === 'proxy') {
    return proxyExecuteOracleQuery(requireProxyEnv(params.env), params.config, params.sql, maxRows);
  }
  try {
    const { executeOracleQueryDirect } = await import('@aiagents-hub/oracle-db');
    return await executeOracleQueryDirect(params.config, params.sql, maxRows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`check_sql: Oracle connection failed — ${message}`);
  }
}
