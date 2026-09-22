import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ORACLE_PROXY_TIMEOUT_MS,
  proxyListOracleTables,
  resolveOracleProxyTimeoutMs,
} from './oracle-proxy-client.js';

describe('resolveOracleProxyTimeoutMs', () => {
  it('defaults to 60s', () => {
    expect(resolveOracleProxyTimeoutMs({})).toBe(DEFAULT_ORACLE_PROXY_TIMEOUT_MS);
  });

  it('clamps to min/max', () => {
    expect(resolveOracleProxyTimeoutMs({ ORACLE_PROXY_TIMEOUT_MS: 100 })).toBe(5_000);
    expect(resolveOracleProxyTimeoutMs({ ORACLE_PROXY_TIMEOUT_MS: 999_999 })).toBe(120_000);
    expect(resolveOracleProxyTimeoutMs({ ORACLE_PROXY_TIMEOUT_MS: '45000' })).toBe(45_000);
  });
});

describe('proxyCall timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fails the call when the proxy never responds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );

    const pending = proxyListOracleTables(
      {
        ORACLE_PROXY_URL: 'https://oracle-proxy.example',
        ORACLE_PROXY_SECRET: 'secret',
        ORACLE_PROXY_TIMEOUT_MS: 5_000,
      },
      { user: 'u', password: 'p', connectString: 'db' },
      'SCHEMA',
    );

    const assertion = expect(pending).rejects.toThrow(
      /Oracle proxy timed out after 5000ms \(listTables\)/,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });
});
