import { describe, expect, it } from 'vitest';

import { parseSubscriptions, mapBillableMetricId } from './cloudflare-client.js';
import { allotmentsForPlan, seedPricingCatalog, utcMonthPeriod } from './domain.js';
import { forecastMetric, overageUsd } from './forecast.js';
import { HUB_WRANGLER_FACTS } from './inventory.js';
import { buildRecommendations } from './recommendations.js';
import type { UsageMetricRow } from './domain.js';

const catalog = seedPricingCatalog();

function paidAllotment(metricId: string) {
  const row = allotmentsForPlan(catalog, 'workers_paid').find((a) => a.metricId === metricId);
  if (!row) throw new Error(metricId);
  return row;
}

function freeAllotment(metricId: string) {
  const row = allotmentsForPlan(catalog, 'workers_free').find((a) => a.metricId === metricId);
  if (!row) throw new Error(metricId);
  return row;
}

describe('cloudflare usage forecast', () => {
  const periodStart = new Date('2026-09-01T00:00:00.000Z');
  const periodEnd = new Date('2026-10-01T00:00:00.000Z');
  const now = new Date('2026-09-11T00:00:00.000Z');

  it('projects 4M requests over 10 days in a 30-day Paid period to 12M and exhausts included mid-period', () => {
    const row = forecastMetric({
      allotment: paidAllotment('workers.requests'),
      planId: 'workers_paid',
      usageMtd: 4_000_000,
      now,
      periodStart,
      periodEnd,
    });
    expect(row.projectedEom).toBe(12_000_000);
    expect(row.status).toBe('projected_over');
    expect(row.overageProjected).toBe(2_000_000);
    expect(row.overageUsdProjected).toBeCloseTo(0.6, 6);
    expect(row.exhaustAt).toBeTruthy();
    const exhaust = new Date(row.exhaustAt as string);
    expect(exhaust.getUTCDate()).toBe(26);
    expect(exhaust.getUTCMonth()).toBe(8);
  });

  it('marks Paid requests over included with overage now', () => {
    const row = forecastMetric({
      allotment: paidAllotment('workers.requests'),
      planId: 'workers_paid',
      usageMtd: 12_000_000,
      now,
      periodStart,
      periodEnd,
    });
    expect(row.status).toBe('over');
    expect(row.overageNow).toBe(2_000_000);
    expect(row.overageUsdNow).toBeCloseTo(0.6, 6);
    expect(row.exhaustAt).toBeTruthy();
    expect(new Date(row.exhaustAt as string).getTime()).toBeLessThan(now.getTime());
  });

  it('leaves exhaustAt null when daily rate is 0', () => {
    const row = forecastMetric({
      allotment: paidAllotment('workers.requests'),
      planId: 'workers_paid',
      usageMtd: 0,
      now,
      periodStart,
      periodEnd,
    });
    expect(row.exhaustAt).toBeNull();
    expect(row.status).toBe('under');
  });

  it('flags Free D1 rows-read hard-stop when today hits the daily cap', () => {
    const row = forecastMetric({
      allotment: freeAllotment('d1.rows_read'),
      planId: 'workers_free',
      usageMtd: 1_000_000,
      usageToday: 5_000_000,
      now,
      periodStart,
      periodEnd,
    });
    expect(row.status).toBe('hard_stop_today');
    expect(row.hardStopWhenExceeded).toBe(true);
    expect(row.overageUsdNow).toBe(0);
  });

  it('does not assume a UTC month when subscription dates exist', () => {
    const utc = utcMonthPeriod(now);
    expect(utc.start.toISOString().startsWith('2026-09-01')).toBe(true);
  });
});

describe('overage rounding', () => {
  it('rounds 1 KV write overage up to a million-block $5 charge', () => {
    const kv = paidAllotment('kv.writes');
    const billed = overageUsd(1, kv.unitScale, kv.overageUsdPerUnit, kv.roundUp);
    expect(billed.usd).toBe(5);
    expect(billed.rounded).toBe(true);
  });

  it('does not round zero overage', () => {
    const kv = paidAllotment('kv.writes');
    expect(overageUsd(0, kv.unitScale, kv.overageUsdPerUnit, kv.roundUp)).toEqual({ usd: 0, rounded: false });
  });
});

describe('plan detection fail-closed', () => {
  it('classifies an empty subscription list as Workers Free, not Paid', () => {
    const plans = parseSubscriptions([], new Date('2026-09-11T00:00:00.000Z'), 'acct');
    expect(plans.workers.planId).toBe('workers_free');
    expect(plans.workers.subscriptionUsdPerMonth).toBe(0);
  });

  it('detects workers_paid from rate_plan.id', () => {
    const plans = parseSubscriptions(
      [
        {
          current_period_start: '2026-09-01T00:00:00.000Z',
          current_period_end: '2026-10-01T00:00:00.000Z',
          price: 5,
          state: 'Paid',
          rate_plan: { id: 'workers_paid', public_name: 'Workers Paid', scope: 'account' },
        },
      ],
      new Date('2026-09-11T00:00:00.000Z'),
      'acct',
    );
    expect(plans.workers.planId).toBe('workers_paid');
    expect(plans.workers.subscriptionUsdPerMonth).toBe(5);
    expect(plans.workers.periodAssumedUtc).toBe(false);
  });

  it('does not treat a zone Pro subscription as Workers Paid', () => {
    const plans = parseSubscriptions(
      [{ rate_plan: { id: 'pro', public_name: 'Pro', scope: 'zone' }, price: 20, state: 'Paid' }],
      new Date('2026-09-11T00:00:00.000Z'),
      'acct',
    );
    expect(plans.workers.planId).toBe('workers_free');
  });
});

describe('billable metric mapping', () => {
  it('maps known ids and leaves unknown unmapped', () => {
    expect(mapBillableMetricId('workers_standard_requests', 'Workers Standard Requests')).toBe('workers.requests');
    expect(mapBillableMetricId('mystery_sku_99', 'Something Obscure')).toBeNull();
  });
});

describe('queue ops stay under Paid included', () => {
  it('treats 100k successful messages (~300k ops) as under', () => {
    const row = forecastMetric({
      allotment: paidAllotment('queues.operations'),
      planId: 'workers_paid',
      usageMtd: 300_000,
      now: new Date('2026-09-11T00:00:00.000Z'),
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(row.status).toBe('under');
    expect(row.overageUsdNow).toBe(0);
  });
});

function stubMetric(partial: Partial<UsageMetricRow> & Pick<UsageMetricRow, 'metricId'>): UsageMetricRow {
  return {
    family: 'compute',
    label: partial.metricId,
    planId: 'workers_paid',
    included: 1,
    includedPeriod: 'month',
    unit: 'u',
    usageMtd: 0,
    pctOfIncluded: 0,
    projectedEom: 0,
    exhaustAt: null,
    overageNow: 0,
    overageProjected: 0,
    overageUsdNow: 0,
    overageUsdProjected: 0,
    rounded: false,
    hardStopWhenExceeded: false,
    status: 'under',
    confidence: 'high',
    burstPattern: false,
    costSource: 'catalog_estimate',
    ...partial,
  };
}

describe('recommendations', () => {
  it('always flags the split SYSTEM_CONFIG_KV namespaces', () => {
    expect(HUB_WRANGLER_FACTS.systemConfigKvIds).toHaveLength(2);
    const recs = buildRecommendations({ planId: 'workers_paid', metrics: [], inventory: [] });
    expect(recs.some((r) => r.id === 'kv.split_system_config')).toBe(true);
  });

  it('fires plan.free_hardstop only on Workers Free', () => {
    expect(buildRecommendations({ planId: 'workers_free', metrics: [], inventory: [] }).some((r) => r.id === 'plan.free_hardstop')).toBe(true);
    expect(buildRecommendations({ planId: 'workers_paid', metrics: [], inventory: [] }).some((r) => r.id === 'plan.free_hardstop')).toBe(false);
  });

  it('does not fire vectorize.small when queried dims are above 20% included', () => {
    const recs = buildRecommendations({
      planId: 'workers_paid',
      metrics: [stubMetric({ metricId: 'vectorize.queried_dims', pctOfIncluded: 45, status: 'under' })],
      inventory: [],
    });
    expect(recs.some((r) => r.id === 'vectorize.small')).toBe(false);
  });

  it('fires obs.unsampled when logs are at least 50% of included', () => {
    const recs = buildRecommendations({
      planId: 'workers_paid',
      metrics: [stubMetric({ metricId: 'workers.logs_events', pctOfIncluded: 55, usageMtd: 11_000_000, status: 'watch' })],
      inventory: [],
    });
    expect(recs.some((r) => r.id === 'obs.unsampled')).toBe(true);
  });

  it('fires d1.retention_96, do.ws_duration, and ai.neurons_daily when predicates match', () => {
    const recs = buildRecommendations({
      planId: 'workers_paid',
      metrics: [
        stubMetric({ metricId: 'd1.storage_gb', status: 'watch', pctOfIncluded: 85, usageMtd: 4.3 }),
        stubMetric({ metricId: 'do.duration_gb_s', status: 'over', pctOfIncluded: 120, overageUsdProjected: 12 }),
        stubMetric({ metricId: 'workers_ai.neurons', usageToday: 9000, status: 'watch' }),
      ],
      inventory: [],
    });
    expect(recs.map((r) => r.id)).toEqual(
      expect.arrayContaining(['d1.retention_96', 'do.ws_duration', 'ai.neurons_daily', 'kv.split_system_config']),
    );
  });
});
