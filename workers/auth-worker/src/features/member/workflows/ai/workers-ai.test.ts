import { describe, expect, it, vi } from 'vitest';

import {
  isAiAccountLimitedError,
  isAiCapacityError,
  withAiCapacityRetry,
} from './workers-ai.js';

describe('Workers AI capacity errors', () => {
  it('detects 3040 capacity errors from message or code', () => {
    expect(isAiCapacityError(new Error('3040: Capacity temporarily exceeded, please try again.'))).toBe(
      true,
    );
    expect(isAiCapacityError({ code: 3040, message: 'Out of capacity' })).toBe(true);
    expect(isAiCapacityError(new Error('No more data centers to forward the request to'))).toBe(true);
  });

  it('does not treat daily neuron exhaustion as retryable', () => {
    const limited = new Error(
      '3036: You have used up your daily free allocation of 10,000 neurons.',
    );
    expect(isAiAccountLimitedError(limited)).toBe(true);
    expect(isAiCapacityError(limited)).toBe(false);
  });

  it('retries 3040 then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('3040: Capacity temporarily exceeded, please try again.'))
      .mockResolvedValueOnce('ok');

    await expect(withAiCapacityRetry(fn, { wait: async () => undefined })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry 3036', async () => {
    const err = new Error('3036: You have used up your daily free allocation of 10,000 neurons.');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withAiCapacityRetry(fn, { wait: async () => undefined })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
