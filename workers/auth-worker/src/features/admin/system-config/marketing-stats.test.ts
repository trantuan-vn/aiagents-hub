import { describe, expect, it } from 'vitest';

import { displayedMarketingCount, rollupAccumulator } from './marketing-stats';

describe('displayedMarketingCount', () => {
  it('starts from seed then adds real × coeff', () => {
    expect(displayedMarketingCount(18_400, 0, 8)).toBe(18_400);
    expect(displayedMarketingCount(18_400, 12, 8)).toBe(18_496);
  });

  it('coeff 1 is seed + real', () => {
    expect(displayedMarketingCount(18_400, 2_000, 1)).toBe(20_400);
  });
});

describe('rollupAccumulator', () => {
  it('first day snapshots baseline without adding history', () => {
    const next = rollupAccumulator(
      { usersReal: 0, runsReal: 0, lastUsersTotal: 0, lastRunsTotal: 0, lastUtcDate: '' },
      40,
      90,
      '2026-09-18',
    );
    expect(next).toEqual({
      usersReal: 0,
      runsReal: 0,
      lastUsersTotal: 40,
      lastRunsTotal: 90,
      lastUtcDate: '2026-09-18',
    });
  });

  it('later days add only the delta', () => {
    const next = rollupAccumulator(
      {
        usersReal: 0,
        runsReal: 0,
        lastUsersTotal: 40,
        lastRunsTotal: 90,
        lastUtcDate: '2026-09-18',
      },
      47,
      110,
      '2026-09-19',
    );
    expect(next.usersReal).toBe(7);
    expect(next.runsReal).toBe(20);
    expect(next.lastUtcDate).toBe('2026-09-19');
  });

  it('same day is a no-op', () => {
    const acc = {
      usersReal: 7,
      runsReal: 20,
      lastUsersTotal: 47,
      lastRunsTotal: 110,
      lastUtcDate: '2026-09-19',
    };
    expect(rollupAccumulator(acc, 99, 999, '2026-09-19')).toEqual(acc);
  });
});
