import { describe, expect, it, vi } from 'vitest';

vi.mock('./get-royalty-percent.js', () => ({
  getWorkflowRoyaltyPercentFromEnv: vi.fn().mockResolvedValue(5),
}));

import { computeWorkflowRoyaltyUsd, resolveWorkflowRoyalty } from './royalty.js';

const ownerId = 'a'.repeat(64);
const consumerDoId = 'b'.repeat(64);

describe('computeWorkflowRoyaltyUsd', () => {
  it('takes percent of billed usage', () => {
    expect(computeWorkflowRoyaltyUsd(1, 5)).toBe(0.05);
    expect(computeWorkflowRoyaltyUsd(0.00001234, 5)).toBe(0.00000062);
  });

  it('is zero without a billable base or percent', () => {
    expect(computeWorkflowRoyaltyUsd(0, 5)).toBe(0);
    expect(computeWorkflowRoyaltyUsd(1, 0)).toBe(0);
  });
});

describe('resolveWorkflowRoyalty', () => {
  const env = {
    USER_DO: {
      idFromName: (name: string) => ({ toString: () => `named:${name}` }),
    },
  } as unknown as Env;

  it('skips when the consumer is the owner', async () => {
    const resolved = await resolveWorkflowRoyalty(env, 'USER_DO', {
      workflowId: 7,
      workflowOwnerId: ownerId,
      consumerIdentifier: ownerId,
      baseCostUsd: 1,
    });
    expect(resolved).toBeNull();
  });

  it('computes royalty for a different consumer', async () => {
    const resolved = await resolveWorkflowRoyalty(env, 'USER_DO', {
      workflowId: 7,
      workflowOwnerId: ownerId,
      consumerIdentifier: consumerDoId,
      baseCostUsd: 1,
    });
    expect(resolved).toMatchObject({
      royaltyAmountUsd: 0.05,
      royaltyPercent: 5,
      consumerDoId,
    });
  });
});
