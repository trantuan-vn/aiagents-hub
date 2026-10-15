import { describe, expect, it, vi } from 'vitest';

import { gatewayForExecution, type AiCallStamp } from '../ai/workers-ai.js';
import { runTextModel } from './billing.js';

const stamp: AiCallStamp = {
  executionKey: '11111111-1111-4111-8111-111111111111',
  workflowId: '3',
  nodeId: 'chat',
  kind: 'text',
};

describe('runTextModel gateway stamp', () => {
  it('sends stamped text calls through gatewayForExecution', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'ok' });
    const env = { AI: { run } } as unknown as Env;
    await runTextModel(env, '@cf/test', [{ role: 'user', content: 'hi' }], 32, undefined, stamp);
    expect(run).toHaveBeenCalledWith(
      '@cf/test',
      expect.objectContaining({ messages: [{ role: 'user', content: 'hi' }] }),
      { gateway: gatewayForExecution(stamp) },
    );
  });

  it('uses kind agree on the 5016 probe and keeps the same execution key', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('5016: Prior to using this model, agree'))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ response: 'after' });
    const env = { AI: { run } } as unknown as Env;
    await expect(
      runTextModel(env, '@cf/test', [{ role: 'user', content: 'hi' }], 16, undefined, stamp),
    ).resolves.toEqual({ response: 'after' });
    expect(run).toHaveBeenNthCalledWith(
      2,
      '@cf/test',
      { prompt: 'agree' },
      { gateway: gatewayForExecution({ ...stamp, kind: 'agree' }) },
    );
    const agree = run.mock.calls[1]?.[2] as { gateway: { eventId: string; metadata: { kind: string } } };
    expect(agree.gateway.eventId).toBe(stamp.executionKey);
    expect(agree.gateway.metadata.kind).toBe('agree');
  });

  it('stops the call when the reasoning budget elapses', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn().mockImplementation(() => new Promise(() => undefined));
      const env = { AI: { run } } as unknown as Env;
      const pending = runTextModel(
        env,
        '@cf/test',
        [{ role: 'user', content: 'hi' }],
        32,
        undefined,
        stamp,
        4_000,
      );
      const assertion = expect(pending).rejects.toThrow('Agent reasoning exceeded 4s');
      await vi.advanceTimersByTimeAsync(4_000);
      await assertion;
      const options = run.mock.calls[0]?.[2] as { gateway: { requestTimeoutMs?: number; retries?: { maxAttempts?: number } } };
      expect(options.gateway.requestTimeoutMs).toBe(4_000);
      expect(options.gateway.retries?.maxAttempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
