export type { DbColumnInfo, DbForeignKey, OracleConnectConfig, OracleSqlHistoryEntry } from './types.js';
export {
  executeOracleQueryDirect,
  validateOracleQueryDirect,
  fetchOracleSqlHistoriesDirect,
  introspectOracleTableDirect,
  introspectOracleTablesDirect,
  listOracleTablesDirect,
  withOracleConnection,
  wrapReadOnlyProbeSql,
} from './direct.js';
export type {
  OracleQueryErr,
  OracleQueryOk,
  OracleQueryResult,
  OracleTableIntrospectResult,
  OracleTablesIntrospectResult,
} from './direct.js';

export function isCloudflareWorkersRuntime(): boolean {
  const g = globalThis as { Cloudflare?: unknown; navigator?: { userAgent?: string } };
  return g.Cloudflare != null || g.navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}
