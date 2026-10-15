import { afterEach, describe, expect, it } from 'vitest';

import {
  resetSiteSupportRateLimitMemory,
  SITE_SUPPORT_RATE_LIMIT,
  trackSiteSupportPost,
} from './site-support-rate-limit';

afterEach(() => {
  resetSiteSupportRateLimitMemory();
});

function envWithKv(): Env {
  const store = new Map<string, string>();
  return {
    NONCE_KV: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
  } as Env;
}

/** Walk the clock so window and daily caps do not stop a lifetime fill. */
async function allowQuestions(env: Env, ip: string, count: number, start: number): Promise<number> {
  let now = start;
  let sentToday = 0;
  for (let i = 0; i < count; i += 1) {
    if (sentToday >= SITE_SUPPORT_RATE_LIMIT.DAILY_MAX) {
      const date = new Date(now);
      now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + 24 * 60 * 60 * 1000;
      sentToday = 0;
    }
    if (sentToday > 0 && sentToday % SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX === 0) {
      now += SITE_SUPPORT_RATE_LIMIT.WINDOW_MS;
    }
    expect(await trackSiteSupportPost(env, ip, now)).toBeNull();
    sentToday += 1;
    now += 1000;
  }
  return now;
}

describe('trackSiteSupportPost', () => {
  it('allows 10 posts in 10 minutes and blocks the next one for 10 minutes', async () => {
    const env = envWithKv();
    const now = Date.UTC(2026, 9, 15, 3, 0, 0);
    for (let i = 0; i < SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX; i += 1) {
      expect(await trackSiteSupportPost(env, '203.0.113.5', now + i)).toBeNull();
    }
    const blocked = await trackSiteSupportPost(env, '203.0.113.5', now + SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX);
    expect(blocked).toEqual({
      kind: 'blocked',
      retryAfter: SITE_SUPPORT_RATE_LIMIT.BLOCK_MS / 1000,
      code: 'site_support_window',
    });
  });

  it('does not count a blocked burst toward the daily quota', async () => {
    const env = envWithKv();
    const start = Date.UTC(2026, 9, 15, 3, 0, 0);
    let now = await allowQuestions(env, '203.0.113.8', SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX, start);
    expect(await trackSiteSupportPost(env, '203.0.113.8', now)).toMatchObject({ code: 'site_support_window' });
    now = await allowQuestions(
      env,
      '203.0.113.8',
      SITE_SUPPORT_RATE_LIMIT.DAILY_MAX - SITE_SUPPORT_RATE_LIMIT.WINDOW_MAX,
      now + SITE_SUPPORT_RATE_LIMIT.WINDOW_MS,
    );
    expect(await trackSiteSupportPost(env, '203.0.113.8', now)).toMatchObject({
      kind: 'blocked',
      code: 'site_support_daily',
    });
  });

  it('resets the daily cap at the next UTC midnight', async () => {
    const env = envWithKv();
    const now = await allowQuestions(env, '203.0.113.6', SITE_SUPPORT_RATE_LIMIT.DAILY_MAX, Date.UTC(2026, 9, 15, 3, 0, 0));
    expect(await trackSiteSupportPost(env, '203.0.113.6', now)).toMatchObject({
      kind: 'blocked',
      code: 'site_support_daily',
    });
    expect(await trackSiteSupportPost(env, '203.0.113.6', Date.UTC(2026, 9, 16, 0, 0, 0))).toBeNull();
  });

  it('stops at 100 workflow replies and keeps the gate without another workflow run', async () => {
    const env = envWithKv();
    const now = await allowQuestions(env, '203.0.113.7', SITE_SUPPORT_RATE_LIMIT.LIFETIME_MAX, Date.UTC(2026, 9, 15, 3, 0, 0));
    expect(await trackSiteSupportPost(env, '203.0.113.7', now + 1)).toEqual({ kind: 'account_gate' });
    resetSiteSupportRateLimitMemory();
    expect(await trackSiteSupportPost(env, '203.0.113.7', now + 2)).toEqual({ kind: 'account_gate' });
  });
});
