import {
  INFRA_BUFFER_PROPOSE_DELTA_PCT,
  PROJECTED_OVER_ALERT_MIN_DAYS,
  SAMPLING_DEFAULT_RATE,
  SAMPLING_MAX_RATE,
  SAMPLING_MIN_RATE,
  type UsageMetricRow,
} from './domain.js';

export type ProjectedOverWarning = {
  metricId: string;
  label: string;
  exhaustAt: string;
  daysAhead: number;
  overageUsdProjected: number;
};

export function clampSamplingRate(rate: number, fallback = SAMPLING_DEFAULT_RATE): number {
  const n = Number(rate);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(SAMPLING_MAX_RATE, Math.max(SAMPLING_MIN_RATE, Math.round(n * 1000) / 1000));
}

/** buf = cfCogs / (aiCogs + cfCogs) so infra_allocated ≈ measured Cloudflare COGS. */
export function proposedInfraBufferPct(cfCogsUsd: number, aiCogsUsd: number): number | null {
  if (!(cfCogsUsd > 0) || !(aiCogsUsd > 0)) return null;
  const pct = (100 * cfCogsUsd) / (aiCogsUsd + cfCogsUsd);
  if (!Number.isFinite(pct)) return null;
  return Math.round(Math.min(50, Math.max(1, pct)) * 10) / 10;
}

export function shouldProposeInfraBuffer(currentPct: number, proposedPct: number | null, delta = INFRA_BUFFER_PROPOSE_DELTA_PCT): boolean {
  if (proposedPct == null) return false;
  return Math.abs(proposedPct - currentPct) >= delta;
}

export function projectedOverEarlyWarnings(
  metrics: UsageMetricRow[],
  now = new Date(),
  minDays = PROJECTED_OVER_ALERT_MIN_DAYS,
): ProjectedOverWarning[] {
  const minMs = minDays * 86_400_000;
  const nowMs = now.getTime();
  const out: ProjectedOverWarning[] = [];
  for (const row of metrics) {
    if (row.status !== 'projected_over' || !row.exhaustAt) continue;
    const at = new Date(row.exhaustAt).getTime();
    if (!Number.isFinite(at)) continue;
    const ahead = at - nowMs;
    if (ahead < minMs) continue;
    out.push({
      metricId: row.metricId,
      label: row.label,
      exhaustAt: row.exhaustAt,
      daysAhead: Math.floor(ahead / 86_400_000),
      overageUsdProjected: row.overageUsdProjected,
    });
  }
  return out.sort((a, b) => a.daysAhead - b.daysAhead);
}
