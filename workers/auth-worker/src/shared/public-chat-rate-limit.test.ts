import { afterEach, describe, expect, it } from 'vitest';

import {
  PUBLIC_CHAT_RATE_LIMIT,
  resetPublicChatRateLimitMemory,
  trackPublicChatPost,
} from './public-chat-rate-limit';

afterEach(() => {
  resetPublicChatRateLimitMemory();
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

describe('trackPublicChatPost', () => {
  it('allows 20 posts in a window and blocks the next one', async () => {
    const env = envWithKv();
    const now = 1_700_000_000_000;
    for (let i = 0; i < PUBLIC_CHAT_RATE_LIMIT.MAX; i += 1) {
      expect(await trackPublicChatPost(env, '203.0.113.5', now + i)).toBeNull();
    }
    const blocked = await trackPublicChatPost(env, '203.0.113.5', now + PUBLIC_CHAT_RATE_LIMIT.MAX);
    expect(blocked?.blocked).toBe(true);
    expect(blocked?.retryAfter).toBe(PUBLIC_CHAT_RATE_LIMIT.BLOCK_MS / 1000);
  });

  it('opens a new window after 10 minutes', async () => {
    const env = envWithKv();
    const now = 1_700_000_000_000;
    for (let i = 0; i < PUBLIC_CHAT_RATE_LIMIT.MAX; i += 1) {
      await trackPublicChatPost(env, '203.0.113.6', now);
    }
    expect(await trackPublicChatPost(env, '203.0.113.6', now + PUBLIC_CHAT_RATE_LIMIT.WINDOW_MS)).toBeNull();
  });
});
