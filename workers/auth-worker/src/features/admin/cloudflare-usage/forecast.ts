import type { Confidence, CostSource, MetricAllotment, MetricStatus, UsageMetricRow, WorkersPlanId } from './domain.js';
import { utcDayDiff } from './domain.js';

export type ForecastInput = {
  allotment: MetricAllotment;
  planId: WorkersPlanId;
  usageMtd: number;
  usageToday?: number;
  now: Date;
  periodStart: Date;
  periodEnd: Date;
  invoiceUsd?: number | null;
  unavailable?: boolean;
  unavailableReason?: string;
  breakdown?: UsageMetricRow['breakdown'];
};

export function billableOverage(overage: number, unitScale: number, roundUp: boolean): { quantity: number; rounded: boolean } {
  if (overage <= 0) return { quantity: 0, rounded: false };
  if (!roundUp || unitScale <= 1) return { quantity: overage, rounded: false };
  const blocks = Math.ceil(overage / unitScale);
  const quantity = blocks * unitScale;
  return { quantity, rounded: quantity !== overage };
}

export function overageUsd(overage: number, unitScale: number, usdPerUnit: number, roundUp: boolean): { usd: number; rounded: boolean } {
  if (usdPerUnit <= 0 || overage <= 0) return { usd: 0, rounded: false };
  const billed = billableOverage(overage, unitScale, roundUp);
  const scale = unitScale > 0 ? unitScale : 1;
  return { usd: (billed.quantity / scale) * usdPerUnit, rounded: billed.rounded };
}

export function metricConfidence(daysElapsed: number, burstPattern: boolean): Confidence {
  if (daysElapsed < 3) return 'low';
  if (burstPattern) return 'medium';
  if (daysElapsed >= 14) return 'high';
  return 'medium';
}

function usageForIncluded(input: ForecastInput): number {
  if (input.allotment.includedPeriod === 'day') {
    return input.usageToday ?? input.usageMtd;
  }
  return input.usageMtd;
}

export function forecastMetric(input: ForecastInput): UsageMetricRow {
  const a = input.allotment;
  const daysElapsed = Math.max(1, utcDayDiff(input.periodStart, input.now));
  const daysInPeriod = Math.max(1, utcDayDiff(input.periodStart, input.periodEnd));
  const burstPattern = Boolean(a.burstPattern);
  const confidence = metricConfidence(daysElapsed, burstPattern);

  if (input.unavailable) {
    return {
      metricId: a.metricId,
      family: a.family,
      label: a.label,
      planId: input.planId,
      included: a.included,
      includedPeriod: a.includedPeriod,
      unit: a.unit,
      usageMtd: 0,
      usageToday: input.usageToday,
      pctOfIncluded: a.included > 0 ? 0 : null,
      projectedEom: 0,
      exhaustAt: null,
      overageNow: 0,
      overageProjected: 0,
      overageUsdNow: 0,
      overageUsdProjected: 0,
      rounded: false,
      hardStopWhenExceeded: a.hardStopWhenExceeded,
      status: 'unavailable',
      confidence: 'low',
      burstPattern,
      costSource: 'catalog_estimate',
      unavailableReason: input.unavailableReason,
      breakdown: input.breakdown,
    };
  }

  const usageMtd = Math.max(0, input.usageMtd);
  const usageToday = input.usageToday;
  const dailyRate = usageMtd / daysElapsed;
  const projectedEom = dailyRate * daysInPeriod;
  const includedUsage = usageForIncluded(input);
  const included = a.included;
  const pctOfIncluded = included > 0 ? Math.round((includedUsage / included) * 10000) / 100 : null;

  const overageNow = included > 0 ? Math.max(0, includedUsage - included) : Math.max(0, includedUsage);
  const overageProjected =
    a.includedPeriod === 'day'
      ? Math.max(0, (usageToday ?? dailyRate) - included) * Math.max(1, daysInPeriod - daysElapsed + 1)
      : included > 0
        ? Math.max(0, projectedEom - included)
        : Math.max(0, projectedEom);

  const catalogNow = overageUsd(overageNow, a.unitScale, a.overageUsdPerUnit, a.roundUp);
  const catalogProj = overageUsd(
    a.includedPeriod === 'day' ? Math.max(0, (usageToday ?? dailyRate) - included) * daysInPeriod : overageProjected,
    a.unitScale,
    a.overageUsdPerUnit,
    a.roundUp,
  );

  const hasInvoice = typeof input.invoiceUsd === 'number' && Number.isFinite(input.invoiceUsd);
  const costSource: CostSource = hasInvoice ? 'invoice' : 'catalog_estimate';
  const overageUsdNow = hasInvoice ? Math.max(0, input.invoiceUsd as number) : catalogNow.usd;
  const overageUsdProjected = hasInvoice
    ? overageUsdNow * (daysInPeriod / daysElapsed)
    : catalogProj.usd;

  let exhaustAt: string | null = null;
  if (included > 0 && dailyRate > 0) {
    if (usageMtd >= included && a.includedPeriod === 'month') {
      const daysToHit = included / dailyRate;
      exhaustAt = new Date(input.periodStart.getTime() + daysToHit * 86_400_000).toISOString();
    } else if (a.includedPeriod === 'day' && (usageToday ?? 0) >= included) {
      exhaustAt = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate())).toISOString();
    } else if (a.includedPeriod === 'month') {
      const remaining = Math.max(0, included - usageMtd);
      const daysUntil = remaining / dailyRate;
      const at = new Date(input.now.getTime() + daysUntil * 86_400_000);
      if (at.getTime() < input.periodEnd.getTime()) exhaustAt = at.toISOString();
    }
  }

  const hardStopToday =
    a.hardStopWhenExceeded && a.includedPeriod === 'day' && included > 0 && (usageToday ?? 0) >= included;

  let status: MetricStatus = 'under';
  if (hardStopToday) status = 'hard_stop_today';
  else if (included > 0 && includedUsage >= included) status = 'over';
  else if (included > 0 && projectedEom >= included) status = 'projected_over';
  else if (pctOfIncluded != null && pctOfIncluded >= 80) status = 'watch';

  return {
    metricId: a.metricId,
    family: a.family,
    label: a.label,
    planId: input.planId,
    included,
    includedPeriod: a.includedPeriod,
    unit: a.unit,
    usageMtd,
    usageToday,
    pctOfIncluded,
    projectedEom,
    exhaustAt,
    overageNow,
    overageProjected,
    overageUsdNow,
    overageUsdProjected,
    rounded: catalogNow.rounded || catalogProj.rounded,
    hardStopWhenExceeded: a.hardStopWhenExceeded,
    status,
    confidence,
    burstPattern,
    costSource,
    breakdown: input.breakdown,
  };
}

export function sortMetrics(rows: UsageMetricRow[]): UsageMetricRow[] {
  return [...rows].sort((a, b) => {
    if (b.overageUsdProjected !== a.overageUsdProjected) return b.overageUsdProjected - a.overageUsdProjected;
    const ap = a.pctOfIncluded ?? -1;
    const bp = b.pctOfIncluded ?? -1;
    return bp - ap;
  });
}
