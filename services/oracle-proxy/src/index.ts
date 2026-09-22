import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  executeOracleQueryDirect,
  fetchOracleSqlHistoriesDirect,
  introspectOracleTableDirect,
  introspectOracleTablesDirect,
  listOracleTablesDirect,
  type OracleConnectConfig,
} from '@aiagents-hub/oracle-db';

const app = new Hono();

/** Slightly under auth-worker client default (60s) so proxy returns JSON before fetch abort. */
const DEFAULT_ACTION_TIMEOUT_MS = 55_000;
const MAX_ACTION_TIMEOUT_MS = 115_000;
const MIN_ACTION_TIMEOUT_MS = 5_000;

function resolveActionTimeoutMs(): number {
  const raw = Number(process.env.ORACLE_PROXY_TIMEOUT_MS ?? DEFAULT_ACTION_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_ACTION_TIMEOUT_MS;
  return Math.min(MAX_ACTION_TIMEOUT_MS, Math.max(MIN_ACTION_TIMEOUT_MS, Math.floor(raw)));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Oracle proxy action timed out after ${timeoutMs}ms (${label})`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function safeJson(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (val != null && typeof val === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
      if (val instanceof Date) return val.toISOString();
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) return val.toString('hex');
    }
    if (typeof val === 'bigint') return Number(val);
    return val;
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(safeJson(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
}

function badRequest(message: string) {
  return jsonResponse({ ok: false, error: message }, 400);
}

app.post('/oracle', async (c) => {
  const secret = process.env.ORACLE_PROXY_SECRET?.trim();
  if (!secret) return badRequest('ORACLE_PROXY_SECRET is not configured on the proxy');
  const auth = c.req.header('Authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return unauthorized();

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return badRequest('Invalid JSON body');

  const action = String(body.action ?? '');
  const config = body.config as OracleConnectConfig | undefined;
  if (!config?.user || !config.password || !config.connectString) {
    return badRequest('Missing config.user, config.password, or config.connectString');
  }

  const t0 = Date.now();
  const tableCount = Array.isArray(body.tableNames) ? body.tableNames.length : 0;
  const label =
    action === 'introspectTable'
      ? `${action} ${body.tableName}`
      : action === 'introspectTables' || action === 'sqlHistory'
        ? `${action} x${tableCount}`
        : action === 'executeQuery'
          ? `${action}`
          : action;
  const timeoutMs = resolveActionTimeoutMs();
  console.log(`[oracle-proxy] START ${label} (timeout=${timeoutMs}ms)`);
  try {
    if (action === 'listTables') {
      const schemaName = String(body.schemaName ?? config.user);
      const result = await withTimeout(listOracleTablesDirect(config, schemaName), timeoutMs, label);
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
      return jsonResponse({ ok: true, result });
    }
    if (action === 'introspectTable') {
      const schemaName = String(body.schemaName ?? config.user);
      const tableName = String(body.tableName ?? '');
      const sampleLimit = Number(body.sampleLimit ?? 10);
      if (!tableName) return badRequest('Missing tableName');
      const result = await withTimeout(
        introspectOracleTableDirect(config, schemaName, tableName, sampleLimit),
        timeoutMs,
        label,
      );
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
      return jsonResponse({ ok: true, result });
    }
    if (action === 'introspectTables') {
      const schemaName = String(body.schemaName ?? config.user);
      const tableNames = Array.isArray(body.tableNames)
        ? body.tableNames.map((name) => String(name ?? '').trim()).filter(Boolean)
        : [];
      const sampleLimit = Number(body.sampleLimit ?? 3);
      if (!tableNames.length) return badRequest('Missing tableNames');
      const result = await withTimeout(
        introspectOracleTablesDirect(config, schemaName, tableNames, sampleLimit),
        timeoutMs,
        label,
      );
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
      return jsonResponse({ ok: true, result });
    }
    if (action === 'sqlHistory') {
      const tableNames = Array.isArray(body.tableNames)
        ? body.tableNames.map((name) => String(name ?? '').trim()).filter(Boolean)
        : String(body.tableName ?? '').trim()
          ? [String(body.tableName)]
          : [];
      const limit = Number(body.limit ?? 10);
      if (!tableNames.length) return badRequest('Missing tableNames');
      const result = await withTimeout(
        fetchOracleSqlHistoriesDirect(config, tableNames, limit),
        timeoutMs,
        label,
      );
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
      return jsonResponse({ ok: true, result });
    }
    if (action === 'executeQuery') {
      const sql = String(body.sql ?? '').trim();
      if (!sql) return badRequest('Missing sql');
      const maxRows = Number(body.maxRows ?? 5);
      const result = await withTimeout(
        executeOracleQueryDirect(config, sql, maxRows),
        timeoutMs,
        label,
      );
      console.log(
        `[oracle-proxy] OK ${label} ok=${result.ok} (${Date.now() - t0}ms)`,
      );
      // Always HTTP 200 with nested result so ORA-* reaches the agent as ok:false (not a throw).
      return jsonResponse({ ok: true, result });
    }
    return badRequest(`Unknown action "${action}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[oracle-proxy] FAIL ${label} (${Date.now() - t0}ms): ${message}`);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 8788);
serve({ fetch: app.fetch, port }, () => {
  console.log(`oracle-proxy listening on http://0.0.0.0:${port}`);
});
