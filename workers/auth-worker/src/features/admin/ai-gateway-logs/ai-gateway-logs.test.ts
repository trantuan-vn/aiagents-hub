import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAdminAiGatewayLogsRoutes } from './presentation.js';
import {
  buildExplorerSearchParams,
  buildLogsSearchParams,
  mapGatewayLogRow,
  prepareHead,
} from './client.js';
import { AI_GATEWAY_STAMP_EPOCH_MS } from './domain.js';
import { redactGatewayPayload } from './redact.js';
import { getExecutionGatewayReport, getExplorerGatewayLogDetail, getExplorerGatewayReport } from './report.js';

const KEY = '11111111-1111-4111-8111-111111111111';

function memoryKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      if (options?.expirationTtl != null && options.expirationTtl < 60) {
        throw new Error(`KV PUT failed: 400 Invalid expiration_ttl of ${options.expirationTtl}`);
      }
      store.set(key, value);
    },
  };
}

function row(partial: Record<string, unknown>) {
  return {
    id: 'log-1',
    provider: 'workers-ai',
    model: '@cf/baai/bge-m3',
    success: true,
    cached: false,
    created_at: '2026-10-02T04:30:40.000Z',
    duration: 120,
    tokens_in: 10,
    tokens_out: 4,
    cost: 0.00000055,
    status_code: 200,
    metadata: JSON.stringify({ executionKey: KEY, workflowId: '1', nodeId: 'n', kind: 'embed' }),
    ...partial,
  };
}

function envWith(fetchImpl: typeof fetch, ledger?: Record<string, unknown> | null) {
  return {
    ACCOUNT_ID: 'account-1',
    CLOUDFLARE_USAGE_API_TOKEN: { get: async () => 'token' },
    SYSTEM_CONFIG_KV: memoryKv(),
    D1DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ledger ?? null,
          all: async () => ({ results: [] }),
        }),
      }),
    },
  } as unknown as Env;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AI Gateway log query', () => {
  it('keeps event_id eq when search is added', () => {
    const params = buildLogsSearchParams({
      executionKey: KEY,
      page: 1,
      search: 'glm',
      model: '@cf/zai/glm',
    });
    expect(JSON.parse(params.get('filters') ?? '')).toEqual([
      { key: 'event_id', operator: 'eq', value: [KEY] },
      { key: 'model', operator: 'eq', value: ['@cf/zai/glm'] },
    ]);
    expect(params.get('search')).toBe('glm');
    expect([...params.keys()].some((k) => k.startsWith('filters') && k !== 'filters')).toBe(false);
  });

  it('refuses to show rows from other executions when the filter is ignored', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        result: [
          row({}),
          row({ id: 'log-2', metadata: JSON.stringify({ executionKey: '22222222-2222-4222-8222-222222222222' }) }),
        ],
        result_info: { total_count: 3320 },
      }),
    );
    await expect(
      getExecutionGatewayReport(envWith(fetchImpl as unknown as typeof fetch, null), 'admin', KEY, {}, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'ai_gateway_filter_ignored', status: 502 });
  });

  it('rejects a non-UUID execution key before calling Cloudflare', async () => {
    const fetchImpl = vi.fn();
    await expect(
      getExecutionGatewayReport(envWith(fetchImpl as unknown as typeof fetch), 'admin', 'not-a-uuid', {}),
    ).rejects.toMatchObject({ code: 'invalid_execution_key', status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('redact and row status', () => {
  it('redacts a nested apiKey and keeps the adjacent content', () => {
    const out = redactGatewayPayload({
      messages: [{ role: 'user', content: 'revenue last month', apiKey: 'sk-live' }],
    }) as { messages: Array<{ content: string; apiKey: string }> };
    expect(out.messages[0]?.content).toBe('revenue last month');
    expect(out.messages[0]?.apiKey).toBe('[REDACTED]');
  });

  it('maps cached success and http errors', () => {
    expect(mapGatewayLogRow(row({ success: true, cached: true }))?.status).toBe('cached');
    expect(mapGatewayLogRow(row({ success: false, cached: false, status_code: 500 }))?.status).toBe('error');
  });

  it('truncates an oversized head without throwing', () => {
    const huge = `{"text":"${'a'.repeat(1_500_100)}"}`;
    const prepared = prepareHead(huge, true);
    expect(prepared.truncated).toBe(true);
    expect(typeof prepared.value === 'string' ? prepared.value.length : 0).toBeLessThanOrEqual(1_500_000);
  });
});

describe('execution gateway report', () => {
  it('returns unreadable instead of an empty stamped list when the token is forbidden', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [{ message: 'no' }] }, 403));
    await expect(
      getExecutionGatewayReport(
        envWith(fetchImpl as unknown as typeof fetch, {
          executionKey: KEY,
          startedAt: AI_GATEWAY_STAMP_EPOCH_MS + 1000,
          status: 'completed',
        }),
        'admin',
        KEY,
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: 'ai_gateway_unreadable', status: 503 });
  });

  it('marks a pre-epoch execution with zero rows as unstamped', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: [], result_info: { total_count: 0 } }));
    const report = await getExecutionGatewayReport(
      envWith(fetchImpl as unknown as typeof fetch, {
        executionKey: KEY,
        workflowId: 4,
        workflowName: 'Old',
        status: 'completed',
        startedAt: AI_GATEWAY_STAMP_EPOCH_MS - 1,
        user_id: 'user@example.com',
      }),
      'admin',
      KEY,
      {},
      fetchImpl as unknown as typeof fetch,
    );
    expect(report.link).toBe('unstamped');
    expect(report.logs).toEqual([]);
    expect(report.execution?.ownerHash).toBeTruthy();
    expect(JSON.stringify(report)).not.toContain('user@example.com');
  });

  it('marks a post-epoch execution with zero rows as stamped and empty', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: [], result_info: { total_count: 0 } }));
    const report = await getExecutionGatewayReport(
      envWith(fetchImpl as unknown as typeof fetch, {
        executionKey: KEY,
        startedAt: AI_GATEWAY_STAMP_EPOCH_MS + 5_000,
        status: 'completed',
      }),
      'admin',
      KEY,
      {},
      fetchImpl as unknown as typeof fetch,
    );
    expect(report.link).toBe('stamped');
    expect(report.logs).toEqual([]);
  });

  it('serves the list cache for 20s and refetches after it expires', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-02T06:00:00.000Z'));
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ result: [row({})], result_info: { total_count: 1 } }),
      );
      const env = envWith(fetchImpl as unknown as typeof fetch, null);
      const run = () => getExecutionGatewayReport(env, 'admin', KEY, {}, fetchImpl as unknown as typeof fetch);

      await run();
      const callsAfterFirst = fetchImpl.mock.calls.length;
      await run();
      expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);

      vi.setSystemTime(new Date('2026-10-02T06:00:21.000Z'));
      await run();
      expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the summary at 240 rows and sets truncated', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const rows = Array.from({ length: 24 }, (_, i) =>
        row({
          id: `log-${page}-${i}`,
          cost: 0.01,
          tokens_in: 2,
          tokens_out: 3,
          success: true,
          cached: false,
        }),
      );
      return jsonResponse({ result: rows, result_info: { total_count: 300, page, per_page: 24 } });
    });
    const report = await getExecutionGatewayReport(
      envWith(fetchImpl as unknown as typeof fetch, {
        executionKey: KEY,
        startedAt: AI_GATEWAY_STAMP_EPOCH_MS + 5_000,
      }),
      'admin',
      KEY,
      { page: 1 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(report.summary?.truncated).toBe(true);
    expect(report.summary?.logCount).toBe(300);
    expect(report.summary?.tokensIn).toBe(240 * 2);
    expect(report.logs).toHaveLength(24);
    const pages = fetchImpl.mock.calls.map((call) => Number(new URL(String(call[0])).searchParams.get('page')));
    expect(Math.max(...pages)).toBeLessThanOrEqual(10);
  });

  it('returns 404 when detail metadata belongs to another execution', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        result: row({
          metadata: JSON.stringify({ executionKey: '22222222-2222-4222-8222-222222222222', kind: 'text' }),
          request_head: JSON.stringify({ messages: [{ content: 'hi', apiKey: 'secret' }] }),
          request_head_complete: true,
          response_head: JSON.stringify({ response: 'ok' }),
          response_head_complete: true,
          path: '/ai/run',
          request_type: 'workers-ai',
        }),
      }),
    );
    const { getExecutionGatewayLogDetail } = await import('./report.js');
    await expect(
      getExecutionGatewayLogDetail(
        envWith(fetchImpl as unknown as typeof fetch),
        'admin',
        KEY,
        'log-1',
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('gateway explorer', () => {
  const at = new Date('2026-10-02T05:00:00.000Z');

  function urls(fetchImpl: ReturnType<typeof vi.fn>): string[] {
    return fetchImpl.mock.calls.map((call) => decodeURIComponent(String(call[0])));
  }

  it('filters on created_at and never on event_id, even when search is an execution key', () => {
    const params = buildExplorerSearchParams({
      since: '2026-10-02T04:00:00.000Z',
      page: 2,
      search: KEY,
      model: '@cf/zai/glm',
    });
    expect(JSON.parse(params.get('filters') ?? '')).toEqual([
      { key: 'created_at', operator: 'gt', value: ['2026-10-02T04:00:00.000Z'] },
      { key: 'model', operator: 'eq', value: ['@cf/zai/glm'] },
    ]);
    expect(params.get('search')).toBe(KEY);
    expect(params.get('filters')).not.toContain('event_id');
  });

  it('rejects an unknown range before calling Cloudflare', async () => {
    const fetchImpl = vi.fn();
    await expect(
      getExplorerGatewayReport(envWith(fetchImpl as unknown as typeof fetch), 'admin', { range: 'all' }),
    ).rejects.toMatchObject({ code: 'invalid_range', status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses the page when a row is older than the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    try {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          result: [row({ created_at: '2020-01-01T00:00:00.000Z' })],
          result_info: { total_count: 4000 },
        }),
      );
      await expect(
        getExplorerGatewayReport(
          envWith(fetchImpl as unknown as typeof fetch),
          'admin',
          { range: '1h' },
          fetchImpl as unknown as typeof fetch,
        ),
      ).rejects.toMatchObject({ code: 'ai_gateway_filter_ignored', status: 502 });
      expect(urls(fetchImpl).every((url) => url.includes('"key":"created_at"') && !url.includes('event_id'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns unreadable instead of an empty list when the token is forbidden', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [{ message: 'no' }] }, 403));
    await expect(
      getExplorerGatewayReport(envWith(fetchImpl as unknown as typeof fetch), 'admin', { range: '24h' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'ai_gateway_unreadable', status: 503 });
  });

  it('lists every in-window log, including ones with no execution stamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    try {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          result: [
            row({ id: 'stamped' }),
            row({ id: 'assistant', metadata: '' }),
            row({ id: 'odd', created_at: 'not-a-date' }),
          ],
          result_info: { total_count: 2 },
        }),
      );
      const report = await getExplorerGatewayReport(
        envWith(fetchImpl as unknown as typeof fetch),
        'admin',
        { range: '1h' },
        fetchImpl as unknown as typeof fetch,
      );
      expect(report.scope).toBe('all');
      expect(report.range).toBe('1h');
      expect(report.logs.map((item) => item.id)).toEqual(['stamped', 'assistant']);
      expect(report.logs[0]?.executionKey).toBe(KEY);
      expect(report.logs[1]?.executionKey).toBeNull();
      expect(JSON.stringify(report)).not.toContain('request_head');
      expect(urls(fetchImpl).every((url) => !url.includes('event_id'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caches list rows for 20s and does not keep them after the window moves', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(at);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ result: [row({})], result_info: { total_count: 1 } }),
      );
      const env = envWith(fetchImpl as unknown as typeof fetch);
      const run = () => getExplorerGatewayReport(env, 'admin', { range: '24h' }, fetchImpl as unknown as typeof fetch);
      await run();
      const callsAfterFirst = fetchImpl.mock.calls.length;
      await run();
      expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
      vi.setSystemTime(new Date(at.getTime() + 21_000));
      await run();
      expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the summary at 240 rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    try {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const page = Number(new URL(String(input)).searchParams.get('page') ?? '1');
        const rows = Array.from({ length: 24 }, (_, i) =>
          row({ id: `log-${page}-${i}`, cost: 0.01, tokens_in: 2, tokens_out: 1 }),
        );
        return jsonResponse({ result: rows, result_info: { total_count: 300, page, per_page: 24 } });
      });
      const report = await getExplorerGatewayReport(
        envWith(fetchImpl as unknown as typeof fetch),
        'admin',
        { range: '7d', page: 1 },
        fetchImpl as unknown as typeof fetch,
      );
      expect(report.summary.truncated).toBe(true);
      expect(report.summary.logCount).toBe(300);
      expect(report.summary.tokensIn).toBe(240 * 2);
      const pages = fetchImpl.mock.calls.map((call) => Number(new URL(String(call[0])).searchParams.get('page')));
      expect(Math.max(...pages)).toBeLessThanOrEqual(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a log that belongs to no execution and does not store the body', async () => {
    const store = new Map<string, string>();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        result: row({
          metadata: '',
          request_head: JSON.stringify({ messages: [{ content: 'hi', apiKey: 'sk-live' }] }),
          request_head_complete: true,
          response_head: JSON.stringify({ response: 'ok' }),
          response_head_complete: true,
          path: '/ai/run',
          request_type: 'workers-ai',
        }),
      }),
    );
    const env = envWith(fetchImpl as unknown as typeof fetch);
    env.SYSTEM_CONFIG_KV = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as Env['SYSTEM_CONFIG_KV'];
    const detail = await getExplorerGatewayLogDetail(env, 'admin', 'log-1', fetchImpl as unknown as typeof fetch);
    expect(detail.request).toEqual({ messages: [{ content: 'hi', apiKey: '[REDACTED]' }] });
    const stored = [...store.entries()];
    expect(stored.every(([key]) => key.startsWith('ai-gateway-rl:'))).toBe(true);
    expect(stored.map(([, value]) => value).join('\n')).not.toContain('sk-live');
  });
});

describe('admin routes', () => {
  it('returns 403 for a member on execution and explorer routes', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { role: 'member', identifier: 'member@example.com' });
      await next();
    });
    app.route('/dashboard/admin/ai-gateway', createAdminAiGatewayLogsRoutes());
    const list = await app.request(`/dashboard/admin/ai-gateway/executions/${KEY}/logs`);
    const detail = await app.request(`/dashboard/admin/ai-gateway/executions/${KEY}/logs/log-1`);
    const explorer = await app.request('/dashboard/admin/ai-gateway/logs');
    const explorerDetail = await app.request('/dashboard/admin/ai-gateway/logs/log-1');
    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(explorer.status).toBe(403);
    expect(explorerDetail.status).toBe(403);
  });

  it('returns 429 when the list rate limit is exceeded', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: [], result_info: { total_count: 0 } }));
    const base = envWith(fetchImpl as unknown as typeof fetch, {
      executionKey: KEY,
      startedAt: AI_GATEWAY_STAMP_EPOCH_MS + 1,
    });
    for (let i = 0; i < 30; i += 1) {
      await getExecutionGatewayReport(base, 'admin-rate', KEY, {}, fetchImpl as unknown as typeof fetch);
    }
    await expect(
      getExecutionGatewayReport(base, 'admin-rate', KEY, {}, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ status: 429 });
  });
});
