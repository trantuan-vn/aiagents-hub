import type { OracleConnectConfig } from './connect-config.js';
import type { DbColumnInfo, DbForeignKey } from './types.js';

type ProxyEnv = {
  ORACLE_PROXY_URL?: string;
  ORACLE_PROXY_SECRET?: string;
  /** Wall-clock timeout for each Oracle proxy HTTP call (ms). Default 60000, max 120000. */
  ORACLE_PROXY_TIMEOUT_MS?: string | number;
};

type ProxyResponse<T> = { ok: true; result: T } | { ok: false; error: string };

/** Default matches a heavy Save RAG introspect; keep under typical waitUntil budget. */
export const DEFAULT_ORACLE_PROXY_TIMEOUT_MS = 60_000;
export const MAX_ORACLE_PROXY_TIMEOUT_MS = 120_000;
export const MIN_ORACLE_PROXY_TIMEOUT_MS = 5_000;

export function resolveOracleProxyTimeoutMs(env: ProxyEnv | unknown): number {
  const rec = env && typeof env === 'object' ? (env as ProxyEnv) : {};
  const raw = Number(rec.ORACLE_PROXY_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_ORACLE_PROXY_TIMEOUT_MS;
  return Math.min(
    MAX_ORACLE_PROXY_TIMEOUT_MS,
    Math.max(MIN_ORACLE_PROXY_TIMEOUT_MS, Math.floor(raw)),
  );
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

async function proxyCall<T>(env: ProxyEnv, body: Record<string, unknown>): Promise<T> {
  const baseUrl = String(env.ORACLE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  const secret = String(env.ORACLE_PROXY_SECRET ?? '').trim();
  if (!baseUrl) throw new Error('get_db_info: ORACLE_PROXY_URL is not configured');
  if (!secret) throw new Error('get_db_info: ORACLE_PROXY_SECRET is not configured');

  const timeoutMs = resolveOracleProxyTimeoutMs(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const action = String(body.action ?? 'oracle');

  try {
    const res = await fetch(`${baseUrl}/oracle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await res.text();
    let payload: ProxyResponse<T>;
    try {
      payload = JSON.parse(raw) as ProxyResponse<T>;
    } catch {
      const hint =
        res.status === 403
          ? 'Cloudflare Workers cannot fetch a raw IP or non-standard port; use http(s)://hostname on port 80/443'
          : raw.slice(0, 180).replace(/\s+/g, ' ');
      throw new Error(`get_db_info: Oracle proxy returned invalid JSON (HTTP ${res.status}) — ${hint}`);
    }

    if (!res.ok || !payload.ok) {
      const message = !payload.ok ? payload.error : `HTTP ${res.status}`;
      throw new Error(`get_db_info: Oracle proxy failed — ${message}`);
    }
    return payload.result;
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) {
      throw new Error(
        `Oracle proxy timed out after ${timeoutMs}ms (${action}) — failing node to avoid hanging`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function oracleProxyConfigured(env: unknown): env is ProxyEnv {
  if (!env || typeof env !== 'object') return false;
  const rec = env as ProxyEnv;
  return Boolean(String(rec.ORACLE_PROXY_URL ?? '').trim());
}

export async function proxyListOracleTables(
  env: ProxyEnv,
  config: OracleConnectConfig,
  schemaName: string,
): Promise<string[]> {
  return proxyCall<string[]>(env, { action: 'listTables', config, schemaName });
}

export async function proxyIntrospectOracleTable(
  env: ProxyEnv,
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
  return proxyCall(env, { action: 'introspectTable', config, schemaName, tableName, sampleLimit });
}

export type ProxyTableIntrospection = {
  tableName: string;
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  rowCountEstimate?: number;
  error?: string;
};

export async function proxyIntrospectOracleTables(
  env: ProxyEnv,
  config: OracleConnectConfig,
  schemaName: string,
  tableNames: string[],
  sampleLimit: number,
): Promise<ProxyTableIntrospection[]> {
  return proxyCall(env, { action: 'introspectTables', config, schemaName, tableNames, sampleLimit });
}

export type ProxySqlHistoryEntry = {
  sql: string;
  executedAt?: string;
  durationMs?: number;
  rowCount?: number;
};

export async function proxyFetchOracleSqlHistories(
  env: ProxyEnv,
  config: OracleConnectConfig,
  tableNames: string[],
  limit: number,
): Promise<Record<string, ProxySqlHistoryEntry[]>> {
  return proxyCall(env, { action: 'sqlHistory', config, tableNames, limit });
}

export type ProxyQueryResult =
  | {
      ok: true;
      columns: string[];
      rowCount: number;
      sampleRows: Record<string, unknown>[];
      elapsedMs: number;
    }
  | { ok: false; error: string; oracleCode?: string };

export async function proxyExecuteOracleQuery(
  env: ProxyEnv,
  config: OracleConnectConfig,
  sql: string,
  maxRows: number,
): Promise<ProxyQueryResult> {
  return proxyCall<ProxyQueryResult>(env, { action: 'executeQuery', config, sql, maxRows });
}
