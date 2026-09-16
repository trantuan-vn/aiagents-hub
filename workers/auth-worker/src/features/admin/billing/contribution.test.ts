import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../service/credit.js';
import { applyCoeffsToServices, buildClassProposal, memberCoeffNotices } from './contribution.js';

const eco = billingEconomicsFromConfig();

describe('contribution van', () => {
  it('proposes emergency when observed contribution is negative', () => {
    const proposal = buildClassProposal(
      [{ model: '@cf/meta/llama-3.1-8b-instruct', priceInput: 0.067, priceOutput: 0, modelClass: 'tiny' }],
      'tiny',
      -5,
      eco,
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(proposal?.emergency).toBe(true);
    expect(proposal?.status).toBe('applied');
    expect(proposal?.leadDaysPro).toBe(0);
  });

  it('builds service updates for a matching class', () => {
    const updates = applyCoeffsToServices(
      [
        { id: 1, modelClass: 'tiny', priceInput: 0.067, priceOutput: 0 },
        { id: 2, modelClass: 'frontier', priceInput: 2.5, priceOutput: 10 },
      ],
      'tiny',
      { input: 30, output: 0, inputCache: 0 },
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.data.creditCoeffInput).toBe(30);
    expect(updates[0]?.data.creditRateVersion).toBe(1);
  });

  it('surfaces notices for enterprise with the longer lead date', () => {
    const notices = memberCoeffNotices(
      [
        {
          id: 'x',
          modelClass: 'mid',
          observedContributionPct: 10,
          current: { input: 1, output: 1, inputCache: 0 },
          proposed: { input: 2, output: 2, inputCache: 0 },
          deltaPct: 100,
          emergency: false,
          notify: true,
          leadDaysPro: 7,
          leadDaysEnt: 30,
          status: 'proposed',
          createdAt: '2026-09-16T00:00:00.000Z',
          effectiveAtPro: '2026-09-23T00:00:00.000Z',
          effectiveAtEnt: '2026-10-16T00:00:00.000Z',
        },
      ],
      'enterprise',
      new Date('2026-09-16T00:00:00.000Z'),
    );
    expect(notices[0]?.effectiveAt).toBe('2026-10-16T00:00:00.000Z');
  });
});
