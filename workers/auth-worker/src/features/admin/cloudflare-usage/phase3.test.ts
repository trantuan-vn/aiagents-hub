import { describe, expect, it } from 'vitest';

import { clampSamplingRate, projectedOverEarlyWarnings, proposedInfraBufferPct, shouldProposeInfraBuffer } from './phase3.js';
import type { UsageMetricRow } from './domain.js';

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

describe('infra_buffer proposal', () => {
  it('uses cf / (ai + cf) so allocated infra matches measured COGS', () => {
    expect(proposedInfraBufferPct(12, 88)).toBe(12);
    expect(proposedInfraBufferPct(10, 90)).toBe(10);
  });

  it('returns null without both sides of the ratio', () => {
    expect(proposedInfraBufferPct(0, 10)).toBeNull();
    expect(proposedInfraBufferPct(10, 0)).toBeNull();
  });

  it('proposes when delta is at least 2 points', () => {
    expect(shouldProposeInfraBuffer(12, 12)).toBe(false);
    expect(shouldProposeInfraBuffer(12, 15)).toBe(true);
  });
});

describe('sampling rate clamp', () => {
  it('keeps apply inside 1–10%', () => {
    expect(clampSamplingRate(0.05)).toBe(0.05);
    expect(clampSamplingRate(1)).toBe(0.1);
    expect(clampSamplingRate(0)).toBe(0.01);
  });
});

describe('projected_over alerts', () => {
  const now = new Date('2026-09-19T00:00:00.000Z');

  it('fires when projected_over and exhaust is at least 5 days away', () => {
    const warnings = projectedOverEarlyWarnings(
      [
        stubMetric({
          metricId: 'workers.requests',
          label: 'Requests',
          status: 'projected_over',
          exhaustAt: '2026-09-28T00:00:00.000Z',
          overageUsdProjected: 1.2,
        }),
        stubMetric({
          metricId: 'kv.reads',
          status: 'projected_over',
          exhaustAt: '2026-09-21T00:00:00.000Z',
        }),
        stubMetric({
          metricId: 'd1.rows_read',
          status: 'over',
          exhaustAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      now,
    );
    expect(warnings.map((w) => w.metricId)).toEqual(['workers.requests']);
    expect(warnings[0].daysAhead).toBe(9);
  });
});
