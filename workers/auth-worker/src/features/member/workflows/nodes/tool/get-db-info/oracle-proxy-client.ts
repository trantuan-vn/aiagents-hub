import type { OracleConnectConfig } from './connect-config.js';
import type { DbColumnInfo, DbForeignKey } from './execute.js';

type ProxyEnv = {
  ORACLE_PROXY_URL?: string;
  ORACLE_PROXY_SECRET?: string;
};

type ProxyResponse<T> = { ok: true; result: T } | { ok: false; error: string };

async function proxyCall<T>(env: ProxyEnv, body: Record<string, unknown>): Promise<T> {
  const baseUrl = String(env.ORACLE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
  const secret = String(env.ORACLE_PROXY_SECRET ?? '').trim();
  if (!baseUrl) throw new Error('get_db_info: ORACLE_PROXY_URL is not configured');
  if (!secret) throw new Error('get_db_info: ORACLE_PROXY_SECRET is not configured');

  const res = await fetch(`${baseUrl}/oracle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
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
}

export function oracleProxyConfigured(env: unknown): env is ProxyEnv {
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
