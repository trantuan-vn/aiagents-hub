export type { DbColumnInfo, DbForeignKey, OracleConnectConfig, OracleSqlHistoryEntry } from './types.js';
export {
  fetchOracleSqlHistoriesDirect,
  introspectOracleTableDirect,
  introspectOracleTablesDirect,
  listOracleTablesDirect,
  withOracleConnection,
} from './direct.js';
export type { OracleTableIntrospectResult, OracleTablesIntrospectResult } from './direct.js';

export function isCloudflareWorkersRuntime(): boolean {
  const g = globalThis as { Cloudflare?: unknown; navigator?: { userAgent?: string } };
  return g.Cloudflare != null || g.navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}
