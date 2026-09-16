import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../../admin/service/credit.js';
import {
  assertCanBuyCredits,
  assertCanStartWorkflowRun,
  incrementDailyWorkflowRuns,
  parsePlanId,
  periodEndIso,
  quotaFromUser,
  syncPlanPeriod,
} from './plan.js';

const eco = billingEconomicsFromConfig();

describe('plan entitlements', () => {
  it('defaults unknown plans to free', () => {
    expect(parsePlanId('')).toBe('free');
    expect(parsePlanId('pro')).toBe('pro');
  });

  it('blocks credit packs on Free and daily runs when exhausted', () => {
    const free = quotaFromUser({ planId: 'free', workflowRunsToday: 20, workflowRunsOn: '2026-09-16' }, eco, new Date('2026-09-16T12:00:00.000Z'));
    expect(free.canBuyCredits).toBe(false);
    expect(() => assertCanBuyCredits(free)).toThrow(/Free plan/);
    expect(() => assertCanStartWorkflowRun(free)).toThrow(/quota exceeded/);
  });

  it('grants included credits at the period boundary and expires them at month end', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const patch = syncPlanPeriod({ planId: 'pro', planPeriodYm: '2026-08', walletCurrency: 'CR' }, eco, now);
    expect(patch.grantedIncluded).toBe(true);
    expect(patch.planPeriodYm).toBe('2026-09');
    expect(patch.walletBalance).toBe(5_000);
    expect(periodEndIso('2026-09')).toBe('2026-10-01T00:00:00.000Z');
    const again = syncPlanPeriod({ ...patch, planPeriodYm: '2026-09' }, eco, now);
    expect(again.grantedIncluded).toBe(false);
  });

  it('resets daily runs on a new UTC day', () => {
    const q = quotaFromUser(
      { planId: 'pro', workflowRunsToday: 40, workflowRunsOn: '2026-09-15' },
      eco,
      new Date('2026-09-16T01:00:00.000Z'),
    );
    expect(q.workflowRunsToday).toBe(0);
    expect(incrementDailyWorkflowRuns({ workflowRunsToday: 2, workflowRunsOn: '2026-09-16' }, new Date('2026-09-16T02:00:00.000Z')).workflowRunsToday).toBe(3);
  });

  it('infers Pro from purchased lots when planId is missing', () => {
    const q = quotaFromUser(
      {
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 10, remaining: 10, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' },
        ]),
      },
      eco,
    );
    expect(q.planId).toBe('pro');
    expect(q.canBuyCredits).toBe(true);
  });
});
