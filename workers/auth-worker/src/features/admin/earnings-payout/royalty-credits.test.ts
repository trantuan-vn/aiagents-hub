import { describe, expect, it } from 'vitest';

import { payoutTotalUsd, withWorkflowRoyaltyCredits, workflowRoyaltyUsdToCr } from './royalty-credits.js';

describe('workflow royalty credits', () => {
  it('converts stored royalty USD to CR at the credit price', () => {
    expect(workflowRoyaltyUsdToCr(0.0385, 0.0077)).toBe(5);
  });

  it('pays commission USD plus converted workflow USD', () => {
    expect(payoutTotalUsd(1.25, 0.0385)).toBe(1.2885);
  });

  it('attaches CR and rebuilds the payable total from commission + workflow USD', () => {
    const mapped = withWorkflowRoyaltyCredits(
      {
        commissionAmountUsd: 2,
        workflowRoyaltyAmountUsd: 0.0385,
        totalAmountUsd: 999,
        periods: [
          {
            commissionAmountUsd: 2,
            workflowRoyaltyAmountUsd: 0.0385,
            totalAmountUsd: 999,
          },
        ],
      },
      0.0077,
    );
    expect(mapped.workflowRoyaltyAmountCr).toBe(5);
    expect(mapped.totalAmountUsd).toBe(2.0385);
    expect(mapped.periods?.[0]?.workflowRoyaltyAmountCr).toBe(5);
    expect(mapped.periods?.[0]?.totalAmountUsd).toBe(2.0385);
  });
});
