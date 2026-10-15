import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertSupportChatChallenge } from './human-challenge';
import { CaptchaRequiredError, frontendTurnstileHostnames, InvalidCaptchaError } from './turnstile';

const SITE_KEY = '0x4AAAAAADXOWPMRtW0XIcLk';

afterEach(() => {
  vi.unstubAllGlobals();
});

function envWithTurnstile(): Env {
  const store = new Map<string, string>();
  return {
    FRONTEND_URL: 'https://aiagents-hub.vn',
    ENVIRONMENT: 'production',
    TURNSTILE_SITE_KEY: SITE_KEY,
    TURNSTILE_SECRET_KEY: { get: async () => 'test-turnstile-secret' },
    NONCE_KV: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
  } as unknown as Env;
}

describe('frontendTurnstileHostnames', () => {
  it('accepts the production site and www, and omits localhost', () => {
    const hosts = frontendTurnstileHostnames('https://aiagents-hub.vn', 'production');
    expect(hosts.has('aiagents-hub.vn')).toBe(true);
    expect(hosts.has('www.aiagents-hub.vn')).toBe(true);
    expect(hosts.has('localhost')).toBe(false);
    expect(hosts.has('127.0.0.1')).toBe(false);
  });

  it('allows localhost outside production', () => {
    const hosts = frontendTurnstileHostnames('https://aiagents-hub.vn', 'development');
    expect(hosts.has('localhost')).toBe(true);
    expect(hosts.has('127.0.0.1')).toBe(true);
  });
});

describe('assertSupportChatChallenge', () => {
  it('requires a token before the workflow can run', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      assertSupportChatChallenge(envWithTurnstile(), {
        sessionId: 'session-12345678',
        ip: '203.0.113.5',
      }),
    ).rejects.toBeInstanceOf(CaptchaRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts one support token for the session, then skips siteverify', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: true, action: 'support', hostname: 'aiagents-hub.vn' }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = envWithTurnstile();
    const options = {
      sessionId: 'session-12345678',
      ip: '203.0.113.5',
      turnstileToken: 'fresh-token',
    };
    await assertSupportChatChallenge(env, options);
    await assertSupportChatChallenge(env, { ...options, turnstileToken: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a token solved on another hostname', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: true, action: 'support', hostname: 'evil.example' }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      assertSupportChatChallenge(envWithTurnstile(), {
        sessionId: 'session-12345678',
        ip: '203.0.113.5',
        turnstileToken: 'foreign-token',
      }),
    ).rejects.toBeInstanceOf(InvalidCaptchaError);
  });

  it('rejects a token whose action is not support', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: true, action: 'login', hostname: 'aiagents-hub.vn' }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      assertSupportChatChallenge(envWithTurnstile(), {
        sessionId: 'session-12345678',
        ip: '203.0.113.5',
        turnstileToken: 'login-token',
      }),
    ).rejects.toBeInstanceOf(InvalidCaptchaError);
  });
});
