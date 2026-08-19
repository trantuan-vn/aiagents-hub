import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  introspectOracleTableDirect,
  listOracleTablesDirect,
  type OracleConnectConfig,
} from '@aiagents-hub/oracle-db';

const app = new Hono();

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
  const label = action === 'introspectTable' ? `${action} ${body.tableName}` : action;
  console.log(`[oracle-proxy] START ${label}`);
  try {
    if (action === 'listTables') {
      const schemaName = String(body.schemaName ?? config.user);
      const result = await listOracleTablesDirect(config, schemaName);
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
      return jsonResponse({ ok: true, result });
    }
    if (action === 'introspectTable') {
      const schemaName = String(body.schemaName ?? config.user);
      const tableName = String(body.tableName ?? '');
      const sampleLimit = Number(body.sampleLimit ?? 10);
      if (!tableName) return badRequest('Missing tableName');
      const result = await introspectOracleTableDirect(config, schemaName, tableName, sampleLimit);
      console.log(`[oracle-proxy] OK ${label} (${Date.now() - t0}ms)`);
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
