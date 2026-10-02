import { describe, expect, it, vi } from 'vitest';

import {
  gatewayForExecution,
  isAiAccountLimitedError,
  isAiCapacityError,
  stampFromNode,
  withAiCapacityRetry,
} from './workers-ai.js';

describe('gatewayForExecution', () => {
  const key = '11111111-1111-4111-8111-111111111111';

  it('sets eventId to the execution and exactly four metadata keys', () => {
    const gateway = gatewayForExecution({
      executionKey: key,
      workflowId: '42',
      nodeId: 'node-1',
      kind: 'text',
    });
    expect(gateway.eventId).toBe(key);
    expect(gateway.id).toBe('unitoken');
    expect(Object.keys(gateway.metadata).sort()).toEqual(['executionKey', 'kind', 'nodeId', 'workflowId']);
    expect(gateway.metadata.kind).toBe('text');
    const agent = gatewayForExecution({ executionKey: key, workflowId: '42', nodeId: 'node-1', kind: 'agent' });
    expect(agent.metadata.kind).toBe('agent');
  });

  it('does not put email, authorization, or prompt text in metadata', () => {
    const gateway = gatewayForExecution(
      stampFromNode({ executionKey: key, node: { id: 'n' }, meta: { workflowId: 7 } }, 'embed'),
    );
    const blob = JSON.stringify(gateway);
    expect(blob).not.toMatch(/email|authorization|password|prompt/i);
    expect(gateway.metadata).not.toHaveProperty('owner');
  });

  it('fails closed when the execution key is missing', () => {
    expect(() =>
      gatewayForExecution(stampFromNode({ node: { id: 'n' }, meta: { workflowId: 1 } }, 'text')),
    ).toThrow(/ai_call_missing_execution_key/);
  });
});

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
