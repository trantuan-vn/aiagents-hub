import {
  GET_DB_INFO_CONNECT_STRING_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_SCHEMA_FIELD,
  GET_DB_INFO_USER_FIELD,
} from '@aiagents-hub/workflow-nodes';

import type { OracleConnectConfig } from '../shared/db/connect-config.js';
import { resolveOracleConnectConfig, resolveOracleSchema } from '../shared/db/connect-config.js';
import { validateReadOnly } from '../shared/db/oracle-client.js';
import { resolveConfiguredText } from '../shared/pipeline.js';

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|GRANT|EXECUTE|BEGIN|CALL)\b/i;

export type CheckSqlOk = {
  ok: true;
  sql: string;
  columns: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  elapsedMs: number;
  validatedOnly?: boolean;
  schemaName?: string;
};

export type CheckSqlErr = {
  ok: false;
  error: string;
  oracleCode?: string;
  sql?: string;
  schemaName?: string;
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
  toolConfig?: Record<string, unknown>;
  config?: OracleConnectConfig | null;
};

function mappedConnectFromToolConfig(
  toolConfig: Record<string, unknown>,
  triggerContext: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const user = resolveConfiguredText(
    toolConfig.userField || GET_DB_INFO_USER_FIELD,
    triggerContext,
    '',
  );
  const password = resolveConfiguredText(
    toolConfig.passwordField || GET_DB_INFO_PASSWORD_FIELD,
    triggerContext,
    '',
  );
  const connectString = resolveConfiguredText(
    toolConfig.connectStringField || GET_DB_INFO_CONNECT_STRING_FIELD,
    triggerContext,
    '',
  );
  const schemaName = resolveConfiguredText(
    toolConfig.schemaNameField || GET_DB_INFO_SCHEMA_FIELD,
    triggerContext,
    '',
  );
  if (user) {
    mapped.user = user;
    mapped.u = user;
  }
  if (password) {
    mapped.password = password;
    mapped.p = password;
  }
  if (connectString) {
    mapped.connectString = connectString;
    mapped.c = connectString;
  }
  if (schemaName) {
    mapped.schemaName = schemaName;
    mapped.s = schemaName;
  }
  return mapped;
}

function resolveConfig(params: CheckSqlExecuteParams): OracleConnectConfig | null {
  if (params.config) return params.config;
  const trigger = params.triggerContext ?? {};
  const mapped = mappedConnectFromToolConfig(params.toolConfig ?? {}, trigger);
  return (
    resolveOracleConnectConfig({ ...trigger, ...mapped }) ??
    resolveOracleConnectConfig(mapped) ??
    resolveOracleConnectConfig(trigger)
  );
}

function resolveSchemaName(
  params: CheckSqlExecuteParams,
  config: OracleConnectConfig,
): string {
  const trigger = params.triggerContext ?? {};
  const mapped = mappedConnectFromToolConfig(params.toolConfig ?? {}, trigger);
  const raw = String(
    mapped.schemaName ??
      trigger.schemaName ??
      trigger.schema ??
      trigger.s ??
      (trigger.fields && typeof trigger.fields === 'object'
        ? (trigger.fields as Record<string, unknown>).s ??
          (trigger.fields as Record<string, unknown>).schemaName
        : '') ??
      '',
  ).trim();
  return resolveOracleSchema(raw || undefined, config.user);
}

/**
 * Validate one SELECT on Oracle via EXPLAIN PLAN (no row fetch).
 * Never throws for SQL/ORA errors — returns `{ ok: false }` for the agent loop.
 */
export async function executeCheckSql(params: CheckSqlExecuteParams): Promise<CheckSqlResult> {
  const guarded = guardReadOnlySql(params.sql);
  if (!guarded.ok) return guarded;

  const config = resolveConfig(params);
  if (!config?.user || !config.password || !config.connectString) {
    return {
      ok: false,
      error:
        'Missing Oracle credentials. Set userField / passwordField / connectStringField on Check SQL, or pass user / password / connectString on agent INPUT.',
      sql: guarded.sql,
    };
  }

  const schemaName = resolveSchemaName(params, config);

  try {
    const result = await validateReadOnly({
      env: params.env,
      config,
      sql: guarded.sql,
      schemaName,
    });
    if (!result.ok) {
      return { ...result, sql: guarded.sql, schemaName };
    }
    return { ...result, sql: guarded.sql, schemaName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /ORA-\d+/i.exec(message)?.[0]?.toUpperCase();
    return {
      ok: false,
      error: message.slice(0, 1000),
      ...(code ? { oracleCode: code } : {}),
      sql: guarded.sql,
      schemaName,
    };
  }
}
