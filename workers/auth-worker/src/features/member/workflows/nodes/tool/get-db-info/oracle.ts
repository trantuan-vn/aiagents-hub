import type { OracleConnectConfig } from './connect-config.js';
import type { DbColumnInfo, DbForeignKey } from './execute.js';
import {
  oracleProxyConfigured,
  proxyIntrospectOracleTable,
  proxyListOracleTables,
} from './oracle-proxy-client.js';

type OracleEnv = {
  ORACLE_PROXY_URL?: string;
  ORACLE_PROXY_SECRET?: string;
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
