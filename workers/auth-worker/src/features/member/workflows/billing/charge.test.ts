import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeDynamicAction, resolveWorkflowRoyalty, recordWorkflowRoyalty } = vi.hoisted(() => ({
  executeDynamicAction: vi.fn(),
  resolveWorkflowRoyalty: vi.fn(),
  recordWorkflowRoyalty: vi.fn(),
}));

vi.mock('../../../../shared/utils.js', () => ({
  executeUtils: { executeDynamicAction },
}));

vi.mock('./royalty.js', () => ({
  resolveWorkflowRoyalty,
  recordWorkflowRoyalty,
}));

import { asChargedUsd, asRoyaltyUsd, chargeServiceUsage, reportUsageCharge } from './charge.js';

const ownerId = 'a'.repeat(64);
const userDO = {} as DurableObjectStub<import('../../../ws/infrastructure/UserDO.js').UserDO>;
const env = {} as Env;

describe('reportUsageCharge', () => {
  it('unwraps UsageCharge and omits royalty when zero', () => {
    const onCost = vi.fn();
    expect(reportUsageCharge(onCost, { usageUsd: 1, royaltyUsd: 0, chargedUsd: 1 })).toBe(1);
    expect(onCost).toHaveBeenCalledWith(1);
  });

  it('passes royalty when the consumer paid it', () => {
    const onCost = vi.fn();
    expect(reportUsageCharge(onCost, { usageUsd: 1, royaltyUsd: 0.05, chargedUsd: 1.05 })).toBe(1.05);
    expect(onCost).toHaveBeenCalledWith(1.05, 0.05);
  });

  it('accepts a numeric mock charge', () => {
    expect(asChargedUsd(0.12)).toBe(0.12);
    expect(asRoyaltyUsd(0.12)).toBe(0);
  });
});

describe('chargeServiceUsage', () => {
  beforeEach(() => {
    executeDynamicAction.mockReset();
    resolveWorkflowRoyalty.mockReset();
    recordWorkflowRoyalty.mockReset();
    executeDynamicAction.mockImplementation(async (_do: unknown, op: string) => {
      if (op === 'select') return [{ id: 1, walletBalance: 10, identifier: 'a@x.com' }];
      return undefined;
    });
    recordWorkflowRoyalty.mockResolvedValue({ royaltyAmountUsd: 0.05, royaltyPercent: 5, consumerDoId: 'b' });
  });

  it('debits only usage when the consumer owns the workflow', async () => {
    const result = await chargeServiceUsage({
      env,
      bindingName: 'USER_DO',
      userDO,
      consumerIdentifier: 'a@x.com',
      usageUsd: 1,
      usageData: { serviceId: 9, endpoint: '/ai' },
    });

    expect(result).toEqual({ usageUsd: 1, royaltyUsd: 0, chargedUsd: 1 });
    expect(resolveWorkflowRoyalty).not.toHaveBeenCalled();
    expect(recordWorkflowRoyalty).not.toHaveBeenCalled();
    const multi = executeDynamicAction.mock.calls.find((c) => c[1] === 'multi-table');
    expect(multi?.[2].operations[0].data.walletBalance).toBe(9);
    expect(multi?.[2].operations[1].data).toMatchObject({ cost: 1, serviceId: 9 });
    expect(multi?.[2].operations[1].data.workflowRoyaltyVnd).toBeUndefined();
  });

  it('debits usage plus royalty from A and records royalty for B', async () => {
    resolveWorkflowRoyalty.mockResolvedValue({
      royaltyAmountUsd: 0.05,
      royaltyPercent: 5,
      consumerDoId: 'b'.repeat(64),
    });

    const result = await chargeServiceUsage({
      env,
      bindingName: 'USER_DO',
      userDO,
      consumerIdentifier: 'a@x.com',
      usageUsd: 1,
      workflowAttribution: { workflowId: 7, workflowOwnerId: ownerId },
      usageData: { serviceId: 9, endpoint: '/ai' },
    });

    expect(result).toEqual({ usageUsd: 1, royaltyUsd: 0.05, chargedUsd: 1.05 });
    const multi = executeDynamicAction.mock.calls.find((c) => c[1] === 'multi-table');
    expect(multi?.[2].operations[0].data.walletBalance).toBe(8.95);
    expect(multi?.[2].operations[1].data).toMatchObject({
      cost: 1,
      workflowRoyaltyVnd: 0.05,
      workflowId: 7,
      workflowOwnerId: ownerId,
    });
    expect(recordWorkflowRoyalty).toHaveBeenCalledWith(
      env,
      'USER_DO',
      expect.objectContaining({ workflowId: 7, workflowOwnerId: ownerId, baseCostUsd: 1 }),
    );
  });

  it('rejects when the wallet cannot cover usage plus royalty', async () => {
    executeDynamicAction.mockImplementation(async (_do: unknown, op: string) => {
      if (op === 'select') return [{ id: 1, walletBalance: 1.02 }];
      return undefined;
    });
    resolveWorkflowRoyalty.mockResolvedValue({
      royaltyAmountUsd: 0.05,
      royaltyPercent: 5,
      consumerDoId: 'b'.repeat(64),
    });

    await expect(
      chargeServiceUsage({
        env,
        bindingName: 'USER_DO',
        userDO,
        consumerIdentifier: 'a@x.com',
        usageUsd: 1,
        workflowAttribution: { workflowId: 7, workflowOwnerId: ownerId },
        usageData: { serviceId: 9, endpoint: '/ai' },
      }),
    ).rejects.toThrow('Insufficient wallet balance');
    expect(recordWorkflowRoyalty).not.toHaveBeenCalled();
  });
});
