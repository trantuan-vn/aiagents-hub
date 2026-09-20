import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getKvTextCached,
  invalidateKvCache,
  setKvTextCached,
  SYSTEM_CONFIG_CACHE_TTL_MS,
} from './kv-ttl-cache.js';

afterEach(() => {
  invalidateKvCache();
  vi.restoreAllMocks();
});

describe('getKvTextCached', () => {
  it('hits KV once within the TTL', async () => {
    let reads = 0;
    const kv = {
      get: async () => {
        reads += 1;
        return '{"auth_worker":{}}';
      },
    };

    await getKvTextCached(kv, 'aiagents-hub-system-config');
    await getKvTextCached(kv, 'aiagents-hub-system-config');
    expect(reads).toBe(1);
  });

  it('coalesces concurrent misses into one KV get', async () => {
    let reads = 0;
    let release!: (value: string) => void;
    const kv = {
      get: () => {
        reads += 1;
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
    };

    const first = getKvTextCached(kv, 'k');
    const second = getKvTextCached(kv, 'k');
    release('ok');
    expect(await first).toBe('ok');
    expect(await second).toBe('ok');
    expect(reads).toBe(1);
  });

  it('refetches after TTL', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let reads = 0;
    const kv = {
      get: async () => {
        reads += 1;
        return 'v';
      },
    };

    await getKvTextCached(kv, 'k', SYSTEM_CONFIG_CACHE_TTL_MS);
    now += SYSTEM_CONFIG_CACHE_TTL_MS + 1;
    await getKvTextCached(kv, 'k', SYSTEM_CONFIG_CACHE_TTL_MS);
    expect(reads).toBe(2);
  });

  it('setKvTextCached skips the next get', async () => {
    let reads = 0;
    const kv = {
      get: async () => {
        reads += 1;
        return 'from-kv';
      },
    };
    setKvTextCached('k', 'warm');
    expect(await getKvTextCached(kv, 'k')).toBe('warm');
    expect(reads).toBe(0);
  });
});
