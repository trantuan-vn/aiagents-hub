import {
  CloudflareUsageError,
  OVERVIEW_CACHE_KV_KEY,
  OVERVIEW_CACHE_TTL_SECONDS,
  PRICING_CATALOG_KV_KEY,
  REFRESH_AT_KV_KEY,
  REFRESH_MIN_INTERVAL_MS,
  allotmentsForPlan,
  isPricingCatalog,
  maskAccountId,
  parseIsoDate,
  seedPricingCatalog,
  type ExhaustMarker,
  type OverviewDto,
  type OverviewSummary,
  type PricingCatalog,
  type UsageMetricRow,
  type UsageSnapshotPayload,
} from './domain.js';
import { fetchCloudflareUsage, mergeBillableIntoUsage } from './cloudflare-client.js';
import { forecastMetric, sortMetrics } from './forecast.js';
import { reconcileInventory } from './inventory.js';
import { buildRecommendations } from './recommendations.js';
import { dispatchProjectedOverAlerts } from './alerts.js';
import { upsertInfraBufferProposal } from './infra-buffer.js';
import { projectedOverEarlyWarnings } from './phase3.js';

const SNAPSHOT_DDL = `
CREATE TABLE IF NOT EXISTS cloudflare_usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  workers_plan_id TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (period_start, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_cf_usage_captured ON cloudflare_usage_snapshots (captured_at DESC);
CREATE TABLE IF NOT EXISTS cloudflare_usage_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
`;

let tablesReady = false;

export async function ensureUsageTables(db: D1Database): Promise<void> {
  if (tablesReady) return;
  const statements = SNAPSHOT_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  tablesReady = true;
}

export async function loadPricingCatalog(env: Env): Promise<PricingCatalog> {
  const raw = await env.SYSTEM_CONFIG_KV?.get(PRICING_CATALOG_KV_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPricingCatalog(parsed)) return parsed;
    } catch {
      /* fall through to seed */
    }
  }
  const seed = seedPricingCatalog();
  try {
    await env.SYSTEM_CONFIG_KV?.put(PRICING_CATALOG_KV_KEY, JSON.stringify(seed));
  } catch {
    /* ignore */
  }
  return seed;
}

export async function savePricingCatalog(env: Env, catalog: PricingCatalog): Promise<void> {
  await env.SYSTEM_CONFIG_KV.put(PRICING_CATALOG_KV_KEY, JSON.stringify(catalog));
}

function buildSummary(metrics: UsageMetricRow[], flatUsd: number): OverviewSummary {
  const tracked = metrics.filter((m) => m.status !== 'unavailable');
  const remaining = tracked.filter((m) => m.status === 'under' || m.status === 'watch').length;
  const variableUsdNow = tracked.reduce((s, m) => s + m.overageUsdNow, 0);
  const variableUsdProjected = tracked.reduce((s, m) => s + m.overageUsdProjected, 0);
  const exhaustCandidates = tracked
    .filter((m) => m.exhaustAt)
    .map(
      (m): ExhaustMarker => ({
        metricId: m.metricId,
        label: m.label,
        at: m.exhaustAt as string,
        status: m.status,
      }),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const next = exhaustCandidates[0] ?? null;
  return {
    includedRemainingCount: remaining,
    trackedMetricCount: tracked.length,
    overageUsdNow: variableUsdNow,
    projectedEomUsd: flatUsd + variableUsdProjected,
    flatUsd,
    variableUsdNow,
    variableUsdProjected,
    totalUsdNow: flatUsd + variableUsdNow,
    totalUsdProjected: flatUsd + variableUsdProjected,
    nextExhaust: next,
    noExhaustThisPeriod: !next,
  };
}

export async function syncUsageSnapshot(env: Env, now = new Date()): Promise<UsageSnapshotPayload> {
  const catalog = await loadPricingCatalog(env);
  const fetched = await fetchCloudflareUsage(env, now);
  const { invoiceUsd, unmapped } = mergeBillableIntoUsage(fetched.usage, fetched.billable);
  const periodStart = parseIsoDate(fetched.plans.workers.periodStart) ?? now;
  const periodEnd = parseIsoDate(fetched.plans.workers.periodEnd) ?? now;
  const planId = fetched.plans.workers.planId;
  const allotments = allotmentsForPlan(catalog, planId);

  const metrics: UsageMetricRow[] = [];
  if (planId === 'workers_enterprise' && allotments.length === 0) {
    for (const [metricId, raw] of Object.entries(fetched.usage)) {
      metrics.push({
        metricId,
        family: 'other',
        label: metricId,
        planId,
        included: 0,
        includedPeriod: 'month',
        unit: 'unit',
        usageMtd: raw.mtd,
        usageToday: raw.today,
        pctOfIncluded: null,
        projectedEom: raw.mtd,
        exhaustAt: null,
        overageNow: 0,
        overageProjected: 0,
        overageUsdNow: invoiceUsd[metricId] ?? 0,
        overageUsdProjected: invoiceUsd[metricId] ?? 0,
        rounded: false,
        hardStopWhenExceeded: false,
        status: 'under',
        confidence: 'low',
        burstPattern: false,
        costSource: invoiceUsd[metricId] != null ? 'invoice' : 'catalog_estimate',
        breakdown: raw.breakdown,
      });
    }
  } else {
    for (const allotment of allotments) {
      const raw = fetched.usage[allotment.metricId];
      const usageMtd = raw ? raw.mtd : 0;
      const unreadableReason = fetched.unreadableMetrics[allotment.metricId];
      const unavailable = !raw && invoiceUsd[allotment.metricId] == null && Boolean(unreadableReason);
      metrics.push(
        forecastMetric({
          allotment,
          planId,
          usageMtd,
          usageToday: raw?.today,
          now,
          periodStart,
          periodEnd,
          invoiceUsd: invoiceUsd[allotment.metricId],
          unavailable,
          unavailableReason: unavailable ? unreadableReason : undefined,
          breakdown: raw?.breakdown,
        }),
      );
    }
  }

  for (const row of unmapped) {
    metrics.push({
      metricId: `unmapped:${row.rawId}`,
      family: 'other',
      label: row.rawName,
      planId,
      included: 0,
      includedPeriod: 'month',
      unit: 'unit',
      usageMtd: row.consumed,
      pctOfIncluded: null,
      projectedEom: row.consumed,
      exhaustAt: null,
      overageNow: 0,
      overageProjected: 0,
      overageUsdNow: row.billedUsd ?? 0,
      overageUsdProjected: row.billedUsd ?? 0,
      rounded: false,
      hardStopWhenExceeded: false,
      status: 'under',
      confidence: 'low',
      burstPattern: false,
      costSource: row.billedUsd != null ? 'invoice' : 'catalog_estimate',
    });
  }

  const sorted = sortMetrics(metrics);
  const inventory = reconcileInventory(fetched.inventory);
  const flatUsd =
    fetched.plans.workers.subscriptionUsdPerMonth +
    fetched.plans.zones.reduce((s, z) => s + z.subscriptionUsdPerMonth, 0) +
    fetched.plans.addOns.reduce((s, a) => s + a.usdPerMonth, 0);
  const summary = buildSummary(sorted, flatUsd);
  const cogsInfraUsdEst30d = await queryCogsInfraUsdEst30d(env.D1DB, now);
  const recommendations = buildRecommendations({
    planId,
    metrics: sorted,
    inventory,
    plans: fetched.plans,
    totalUsdProjected: summary.totalUsdProjected,
    cogsInfraUsdEst30d,
    cronCpuByUtcHour: fetched.usage['workers.cpu_ms']?.hourUtcCpuMs,
  });
  const hasInvoice = sorted.some((m) => m.costSource === 'invoice' && m.overageUsdNow > 0);

  const payload: UsageSnapshotPayload = {
    plans: fetched.plans,
    metrics: sorted,
    inventory,
    recommendations,
    summary,
    catalogVersion: catalog.version,
    asOf: catalog.asOf,
    costSource: hasInvoice ? 'invoice' : 'catalog_estimate',
    accountIdMasked: maskAccountId(env.ACCOUNT_ID),
  };

  await persistSnapshot(env, payload, now);
  await env.SYSTEM_CONFIG_KV.put(OVERVIEW_CACHE_KV_KEY, JSON.stringify({ ...payload, cachedAt: now.toISOString() }), {
    expirationTtl: OVERVIEW_CACHE_TTL_SECONDS,
  });
  return payload;
}

async function persistSnapshot(env: Env, payload: UsageSnapshotPayload, now: Date): Promise<void> {
  try {
    await ensureUsageTables(env.D1DB);
    await env.D1DB.prepare(
      `INSERT INTO cloudflare_usage_snapshots
        (captured_at, period_start, period_end, workers_plan_id, catalog_version, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        now.getTime(),
        payload.plans.workers.periodStart,
        payload.plans.workers.periodEnd,
        payload.plans.workers.planId,
        payload.catalogVersion,
        JSON.stringify(payload),
      )
      .run();
  } catch {
    tablesReady = false;
  }
}

export async function latestSnapshot(env: Env): Promise<{ payload: UsageSnapshotPayload; capturedAt: number } | null> {
  try {
    await ensureUsageTables(env.D1DB);
    const row = await env.D1DB.prepare(
      `SELECT captured_at as capturedAt, payload FROM cloudflare_usage_snapshots ORDER BY captured_at DESC LIMIT 1`,
    ).first<{ capturedAt: number; payload: string }>();
    if (!row?.payload) return null;
    const payload = JSON.parse(row.payload) as UsageSnapshotPayload;
    return { payload, capturedAt: Number(row.capturedAt) };
  } catch {
    return null;
  }
}

function asOverview(payload: UsageSnapshotPayload, cachedAt: string, stale: boolean): OverviewDto {
  return { ...payload, cachedAt, stale, alerts: projectedOverEarlyWarnings(payload.metrics) };
}

export async function getOverview(env: Env, opts?: { force?: boolean }): Promise<OverviewDto> {
  if (!opts?.force) {
    const cached = await env.SYSTEM_CONFIG_KV.get(OVERVIEW_CACHE_KV_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as OverviewDto;
        if (parsed.plans?.workers?.planId) return { ...parsed, stale: false, cachedAt: parsed.cachedAt };
      } catch {
        /* ignore */
      }
    }
    const snap = await latestSnapshot(env);
    if (snap) {
      const age = Date.now() - snap.capturedAt;
      if (age < 24 * 60 * 60 * 1000) {
        return asOverview(snap.payload, new Date(snap.capturedAt).toISOString(), age > OVERVIEW_CACHE_TTL_SECONDS * 1000);
      }
    }
  }
  const payload = await syncUsageSnapshot(env);
  return asOverview(payload, new Date().toISOString(), false);
}

export async function refreshOverview(env: Env, actor: string): Promise<OverviewDto> {
  const lastRaw = await env.SYSTEM_CONFIG_KV.get(REFRESH_AT_KV_KEY);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (Number.isFinite(last) && last > 0 && Date.now() - last < REFRESH_MIN_INTERVAL_MS) {
    throw new CloudflareUsageError('rate_limited', 'Refresh is limited to once every 2 minutes', 429);
  }
  await env.SYSTEM_CONFIG_KV.put(REFRESH_AT_KV_KEY, String(Date.now()), { expirationTtl: 3600 });
  const payload = await syncUsageSnapshot(env);
  await writeAudit(env, actor, 'refresh', payload.plans.workers.planId);
  return asOverview(payload, new Date().toISOString(), false);
}

export async function refreshPricingCatalog(env: Env, actor: string, catalog?: PricingCatalog): Promise<PricingCatalog> {
  const next = catalog && isPricingCatalog(catalog) ? catalog : seedPricingCatalog();
  await savePricingCatalog(env, next);
  await env.SYSTEM_CONFIG_KV.delete(OVERVIEW_CACHE_KV_KEY);
  await writeAudit(env, actor, 'pricing_catalog_refresh', next.version);
  return next;
}

async function writeAudit(env: Env, actor: string, action: string, detail: string): Promise<void> {
  try {
    await ensureUsageTables(env.D1DB);
    await env.D1DB.prepare(`INSERT INTO cloudflare_usage_audit (at, actor, action, detail) VALUES (?, ?, ?, ?)`)
      .bind(Date.now(), actor, action, detail)
      .run();
  } catch {
    tablesReady = false;
  }
}

export async function writeUsageAudit(env: Env, actor: string, action: string, detail: string): Promise<void> {
  await writeAudit(env, actor, action, detail);
}

const SNAPSHOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const SNAPSHOT_ARCHIVE_PREFIX = 'cloudflare-usage/snapshots';

async function queryCogsInfraUsdEst30d(db: D1Database, now: Date): Promise<number> {
  const from = now.getTime() - 30 * 86_400_000;
  try {
    const row = await db
      .prepare(
        `SELECT SUM(COALESCE("cogsInfraUsdEst", 0)) as usd
         FROM service_usages
         WHERE created_at >= ? AND created_at <= ?
           AND (isError = 0 OR isError IS NULL)`,
      )
      .bind(from, now.getTime())
      .first<{ usd: number | null }>();
    const usd = Number(row?.usd);
    return Number.isFinite(usd) ? usd : 0;
  } catch {
    return 0;
  }
}

export async function archiveOldSnapshots(env: Env, now = new Date()): Promise<number> {
  const bucket = env.R2_LAKEHOUSE;
  if (!bucket) return 0;
  await ensureUsageTables(env.D1DB);
  const cutoff = now.getTime() - SNAPSHOT_RETENTION_MS;
  const latest = await env.D1DB.prepare(
    `SELECT MAX(captured_at) as maxAt FROM cloudflare_usage_snapshots`,
  ).first<{ maxAt: number | null }>();
  const keepAt = Number(latest?.maxAt ?? 0);
  const rows = await env.D1DB.prepare(
    `SELECT id, captured_at as capturedAt, payload
     FROM cloudflare_usage_snapshots
     WHERE captured_at < ? AND captured_at != ?
     ORDER BY captured_at ASC
     LIMIT 50`,
  )
    .bind(cutoff, keepAt)
    .all<{ id: number; capturedAt: number; payload: string }>();

  let archived = 0;
  for (const row of rows.results ?? []) {
    const day = new Date(row.capturedAt).toISOString().slice(0, 10);
    const key = `${SNAPSHOT_ARCHIVE_PREFIX}/${day}/${row.capturedAt}.json`;
    await bucket.put(key, row.payload, { httpMetadata: { contentType: 'application/json' } });
    await env.D1DB.prepare(`DELETE FROM cloudflare_usage_snapshots WHERE id = ?`).bind(row.id).run();
    archived += 1;
  }
  return archived;
}

export async function dailyUsageSync(env: Env): Promise<void> {
  const payload = await syncUsageSnapshot(env);
  try {
    await archiveOldSnapshots(env);
  } catch {
    /* keep D1 snapshots if R2 archive fails */
  }
  try {
    await dispatchProjectedOverAlerts(env, payload.metrics);
  } catch {
    /* alerts are best-effort */
  }
  try {
    await upsertInfraBufferProposal(env, payload.summary.totalUsdProjected);
  } catch {
    /* proposal is advisory */
  }
}
