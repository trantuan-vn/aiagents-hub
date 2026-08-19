export type { DbColumnInfo, DbForeignKey, OracleConnectConfig } from './types.js';
export {
  introspectOracleTableDirect,
  listOracleTablesDirect,
  withOracleConnection,
} from './direct.js';

export function isCloudflareWorkersRuntime(): boolean {
  const g = globalThis as { Cloudflare?: unknown; navigator?: { userAgent?: string } };
  return g.Cloudflare != null || g.navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}
