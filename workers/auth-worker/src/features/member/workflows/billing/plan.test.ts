import { describe, expect, it } from 'vitest';

import { billingEconomicsFromConfig } from '../../../admin/service/credit.js';
import {
  assertCanBuyCredits,
  assertCanStartWorkflowRun,
  canEnterGrace,
  clampMinPlanId,
  incrementDailyWorkflowRuns,
  parsePlanId,
  periodEndIso,
  prepaidUsd,
  quotaFromUser,
  resolvePlanId,
  syncPlanPeriod,
} from './plan.js';
import { publicPlansCatalog } from './catalog.js';

const eco = billingEconomicsFromConfig();

describe('plan entitlements', () => {
  it('defaults unknown plans to free and maps enterprise to business', () => {
    expect(parsePlanId('')).toBe('free');
    expect(parsePlanId('pro')).toBe('pro');
    expect(parsePlanId('starter')).toBe('starter');
    expect(parsePlanId('enterprise')).toBe('business');
  });

  it('blocks credit packs on Free and daily runs when exhausted', () => {
    const free = quotaFromUser({ planId: 'free', workflowRunsToday: 20, workflowRunsOn: '2026-09-16' }, eco, new Date('2026-09-16T12:00:00.000Z'));
    expect(free.canBuyCredits).toBe(false);
    expect(() => assertCanBuyCredits(free)).toThrow(/Free plan/);
    expect(() => assertCanStartWorkflowRun(free)).toThrow(/quota exceeded/);
  });

  it('does not infer Pro from purchased lots', () => {
    const q = quotaFromUser(
      {
        walletCurrency: 'CR',
        creditLotsJson: JSON.stringify([
          { credits: 10, remaining: 10, expiresAt: '2028-01-01T00:00:00.000Z', source: 'purchased' },
        ]),
      },
      eco,
    );
    expect(q.planId).toBe('free');
    expect(q.canBuyCredits).toBe(false);
  });

  it('honours paypal source for paid plans', () => {
    const q = quotaFromUser({ planId: 'starter', planSource: 'paypal', paypalSubscriptionId: 'I-1' }, eco);
    expect(q.planId).toBe('starter');
    expect(q.canBuyCredits).toBe(true);
    expect(q.entitlement.includedCredits).toBe(500);
  });

  it('grants included credits at the period boundary for the resolved plan', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const patch = syncPlanPeriod(
      { planId: 'pro', planSource: 'paypal', paypalSubscriptionId: 'I-1', planPeriodYm: '2026-08', walletCurrency: 'CR' },
      eco,
      now,
    );
    expect(patch.grantedIncluded).toBe(true);
    expect(patch.planPeriodYm).toBe('2026-09');
    expect(patch.walletBalance).toBe(2_000);
    expect(periodEndIso('2026-09')).toBe('2026-10-01T00:00:00.000Z');
  });

  it('resets daily runs on a new UTC day', () => {
    const q = quotaFromUser(
      { planId: 'pro', planSource: 'admin', workflowRunsToday: 40, workflowRunsOn: '2026-09-15' },
      eco,
      new Date('2026-09-16T01:00:00.000Z'),
    );
    expect(q.workflowRunsToday).toBe(0);
    expect(incrementDailyWorkflowRuns({ workflowRunsToday: 2, workflowRunsOn: '2026-09-16' }, new Date('2026-09-16T02:00:00.000Z')).workflowRunsToday).toBe(3);
  });

  it('clamps creator minPlanId to owner plan', () => {
    expect(clampMinPlanId('business', 'starter')).toBe('starter');
    expect(clampMinPlanId('free', 'pro')).toBe('free');
  });

  it('allows grace only for paid production triggers', () => {
    const quota = quotaFromUser({ planId: 'pro', planSource: 'paypal', paypalSubscriptionId: 'I-1' }, eco);
    expect(canEnterGrace({ quota, triggerKind: 'webhook', workflowGrace: true })).toBe(true);
    expect(canEnterGrace({ quota, triggerKind: 'manual', workflowGrace: true })).toBe(false);
    const free = quotaFromUser({ planId: 'free' }, eco);
    expect(canEnterGrace({ quota: free, triggerKind: 'webhook', workflowGrace: true })).toBe(false);
  });

  it('applies interval prepaid discount', () => {
    expect(prepaidUsd(19.9, 1)).toBe(19.9);
    expect(prepaidUsd(19.9, 12)).toBe(191.04);
  });

  it('blocks share, webhook, and cron on Free', () => {
    const free = quotaFromUser({ planId: 'free' }, eco);
    expect(free.entitlement.canShareWorkflows).toBe(false);
    expect(free.entitlement.canUseWebhooks).toBe(false);
    expect(free.entitlement.canUseCron).toBe(false);
    const starter = quotaFromUser({ planId: 'starter', planSource: 'paypal', paypalSubscriptionId: 'I-1' }, eco);
    expect(starter.entitlement.canUseWebhooks).toBe(true);
    expect(starter.entitlement.canUseCron).toBe(true);
  });

  it('enables billing by default and can be opted out', () => {
    expect(publicPlansCatalog({}).billingEnabled).toBe(true);
    expect(publicPlansCatalog({ PAYPAL_BILLING_ENABLED: 'false' }).billingEnabled).toBe(false);
  });

  it('honours prepaid order source until period end', () => {
    const q = quotaFromUser(
      {
        planId: 'starter',
        planSource: 'order',
        planCurrentPeriodEnd: '2099-01-01T00:00:00.000Z',
      },
      eco,
    );
    expect(q.planId).toBe('starter');
    expect(q.canBuyCredits).toBe(true);
    const expired = quotaFromUser(
      {
        planId: 'starter',
        planSource: 'order',
        planCurrentPeriodEnd: '2020-01-01T00:00:00.000Z',
      },
      eco,
      new Date('2026-09-18T00:00:00.000Z'),
    );
    expect(expired.planId).toBe('free');
  });

  it('builds a public catalog of four plans', () => {
    const catalog = publicPlansCatalog({ PAYPAL_BILLING_ENABLED: 'false' });
    expect(catalog.plans).toHaveLength(4);
    expect(catalog.plans.map((p) => p.planId)).toEqual(['free', 'starter', 'pro', 'business']);
    expect(catalog.billingEnabled).toBe(false);
    expect(catalog.plans[0]?.canUseCron).toBe(false);
    expect(catalog.plans[1]?.canUseCron).toBe(true);
    expect(resolvePlanId({ planId: 'pro' })).toBe('free');
  });
});
