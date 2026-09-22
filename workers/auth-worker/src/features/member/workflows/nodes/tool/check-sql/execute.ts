import type { OracleConnectConfig } from '../shared/db/connect-config.js';
import { resolveOracleConnectConfig } from '../shared/db/connect-config.js';
import { executeReadOnly } from '../shared/db/oracle-client.js';

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|GRANT|EXECUTE|BEGIN|CALL)\b/i;

export type CheckSqlOk = {
  ok: true;
  sql: string;
  columns: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  elapsedMs: number;
};

export type CheckSqlErr = {
  ok: false;
  error: string;
  oracleCode?: string;
  sql?: string;
};

export type CheckSqlResult = CheckSqlOk | CheckSqlErr;

/** Reject non-SELECT probes before opening an Oracle connection. */
export function guardReadOnlySql(sql: string): { ok: true; sql: string } | CheckSqlErr {
  const trimmed = String(sql ?? '').trim();
  if (!trimmed) return { ok: false, error: 'SQL is empty' };
  const withoutTrailing = trimmed.replace(/;+\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { ok: false, error: 'Multiple SQL statements are not allowed' };
  }
  if (!/^(SELECT|WITH)\b/i.test(withoutTrailing)) {
    return { ok: false, error: 'Only SELECT or WITH queries are allowed' };
  }
  if (FORBIDDEN.test(withoutTrailing)) {
    return { ok: false, error: 'Write/DDL statements are not allowed' };
  }
  return { ok: true, sql: withoutTrailing };
}

export type CheckSqlExecuteParams = {
  env: Env;
  sql: string;
  maxRows?: number;
  triggerContext?: Record<string, unknown>;
  config?: OracleConnectConfig | null;
};

function resolveConfig(params: CheckSqlExecuteParams): OracleConnectConfig | null {
  if (params.config) return params.config;
  return resolveOracleConnectConfig(params.triggerContext ?? {});
}

/**
 * Probe one SELECT on Oracle. Never throws for SQL/ORA errors — returns `{ ok: false }`.
 * Connection/config failures also return `{ ok: false }` so the agent can react.
 */
export async function executeCheckSql(params: CheckSqlExecuteParams): Promise<CheckSqlResult> {
  const guarded = guardReadOnlySql(params.sql);
  if (!guarded.ok) return guarded;

  const config = resolveConfig(params);
  if (!config?.user || !config.password || !config.connectString) {
    return {
      ok: false,
      error:
        'Missing Oracle credentials on agent INPUT (user / password / connectString). Connect the same form fields used for ingest.',
      sql: guarded.sql,
    };
  }

  try {
    const result = await executeReadOnly({
      env: params.env,
      config,
      sql: guarded.sql,
      maxRows: params.maxRows,
    });
    if (!result.ok) {
      return { ...result, sql: guarded.sql };
    }
    return { ...result, sql: guarded.sql };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /ORA-\d+/i.exec(message)?.[0]?.toUpperCase();
    return {
      ok: false,
      error: message.slice(0, 1000),
      ...(code ? { oracleCode: code } : {}),
      sql: guarded.sql,
    };
  }
}
