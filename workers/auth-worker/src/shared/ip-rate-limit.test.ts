import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkIpBlocked,
  createIpRateLimitMiddleware,
  IP_RATE_LIMIT,
  recordIpAuthFailure,
  resetIpRateLimitMemory,
  shouldPersistIpRateLimit,
  trackIpRequest,
} from './ip-rate-limit';

afterEach(() => {
  resetIpRateLimitMemory();
  vi.restoreAllMocks();
});

function mockKv(options?: { throwOnPut?: boolean }) {
  const store = new Map<string, string>();
  let puts = 0;
  const kv = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      puts += 1;
      if (options?.throwOnPut) {
        throw new Error('KV PUT failed: 429 Too Many Requests');
      }
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
  return { kv, store, puts: () => puts };
}

function envWithKv(kv: Pick<KVNamespace, 'get' | 'put' | 'delete'>): Env {
  return { NONCE_KV: kv } as Env;
}

describe('shouldPersistIpRateLimit', () => {
  it('writes immediately when forced (block / auth failure)', () => {
    expect(shouldPersistIpRateLimit({ lastKvWriteAt: 5_000, now: 5_100, force: true })).toBe(true);
  });

  it('skips writes inside the per-key KV interval', () => {
    expect(
      shouldPersistIpRateLimit({
        lastKvWriteAt: 1_000,
        now: 1_000 + IP_RATE_LIMIT.KV_WRITE_MIN_INTERVAL_MS - 1,
        force: false,
      }),
    ).toBe(false);
  });

  it('writes after the interval elapses', () => {
    expect(
      shouldPersistIpRateLimit({
        lastKvWriteAt: 1_000,
        now: 1_000 + IP_RATE_LIMIT.KV_WRITE_MIN_INTERVAL_MS,
        force: false,
      }),
    ).toBe(true);
  });
});

describe('trackIpRequest KV writes', () => {
  it('does not throw when KV returns 429', async () => {
    const { kv, puts } = mockKv({ throwOnPut: true });
    await expect(trackIpRequest(envWithKv(kv), '1.1.1.1', '/dashboard/overview')).resolves.toBeNull();
    expect(puts()).toBe(1);
  });

  it('writes at most once per second for the same IP', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { kv, puts } = mockKv();
    const env = envWithKv(kv);

    await trackIpRequest(env, '8.8.8.8', '/dashboard/overview');
    await trackIpRequest(env, '8.8.8.8', '/dashboard/overview');
    await trackIpRequest(env, '8.8.8.8', '/dashboard/overview');
    expect(puts()).toBe(1);

    now += IP_RATE_LIMIT.KV_WRITE_MIN_INTERVAL_MS;
    await trackIpRequest(env, '8.8.8.8', '/dashboard/overview');
    expect(puts()).toBe(2);
  });

  it('forces a KV write when the IP enters a flood block', async () => {
    let now = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { kv, puts } = mockKv();
    const env = envWithKv(kv);

    expect(await trackIpRequest(env, '9.9.9.9', '/x', { requestLimitMax: 2 })).toBeNull();
    expect(await trackIpRequest(env, '9.9.9.9', '/x', { requestLimitMax: 2 })).toBeNull();
    expect(puts()).toBe(1);

    const blocked = await trackIpRequest(env, '9.9.9.9', '/x', { requestLimitMax: 2 });
    expect(blocked?.blocked).toBe(true);
    expect(puts()).toBe(2);
  });

  it('keeps counting in isolate memory after a 429 so the next requests still flood-block', async () => {
    const { kv } = mockKv({ throwOnPut: true });
    const env = envWithKv(kv);
    await trackIpRequest(env, '2.2.2.2', '/x', { requestLimitMax: 2 });
    await trackIpRequest(env, '2.2.2.2', '/x', { requestLimitMax: 2 });
    const blocked = await trackIpRequest(env, '2.2.2.2', '/x', { requestLimitMax: 2 });
    expect(blocked?.blocked).toBe(true);
  });
});

describe('recordIpAuthFailure', () => {
  it('does not throw when KV put fails', async () => {
    const { kv } = mockKv({ throwOnPut: true });
    await expect(recordIpAuthFailure(envWithKv(kv), '3.3.3.3')).resolves.toBeUndefined();
  });
});

describe('checkIpBlocked', () => {
  it('fail-opens when KV get throws', async () => {
    const kv = {
      get: async () => {
        throw new Error('KV GET failed');
      },
      put: async () => {},
      delete: async () => {},
    };
    await expect(checkIpBlocked(envWithKv(kv), '4.4.4.4')).resolves.toEqual({ blocked: false });
  });
});

describe('createIpRateLimitMiddleware', () => {
  it('returns 404 for scanner probes without touching KV', async () => {
    const { kv, puts } = mockKv();
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', createIpRateLimitMiddleware());
    app.all('*', (c) => c.text('ok'));

    const res = await app.request(
      'https://api.aiagents-hub.vn/phpinfo.php',
      { headers: { 'CF-Connecting-IP': '5.5.5.5' } },
      envWithKv(kv),
    );
    expect(res.status).toBe(404);
    expect(puts()).toBe(0);
    expect(await res.text()).toBe('');
  });

  it('lets product routes through', async () => {
    const { kv } = mockKv();
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', createIpRateLimitMiddleware());
    app.get('/dashboard/overview', (c) => c.text('ok'));

    const res = await app.request(
      'https://api.aiagents-hub.vn/dashboard/overview',
      { headers: { 'CF-Connecting-IP': '5.5.5.5' } },
      envWithKv(kv),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
