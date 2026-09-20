export const PRICING_CATALOG_KV_KEY = 'cloudflare-pricing-catalog';
export const OVERVIEW_CACHE_KV_KEY = 'cloudflare-usage-overview';
export const REFRESH_AT_KV_KEY = 'cloudflare-usage-refresh-at';
export const OVERVIEW_CACHE_TTL_SECONDS = 15 * 60;
export const REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const CF_API_TIMEOUT_MS = 8_000;
export const SAMPLING_APPLY_KV_KEY = 'cloudflare-usage-sampling-apply';
export const INFRA_BUFFER_PROPOSAL_KV_KEY = 'cloudflare-usage-infra-buffer-proposal';
export const ALERTS_SENT_KV_KEY = 'cloudflare-usage-alerts-sent';
export const SAMPLING_MIN_RATE = 0.01;
export const SAMPLING_MAX_RATE = 0.1;
export const SAMPLING_DEFAULT_RATE = 0.05;
export const PROJECTED_OVER_ALERT_MIN_DAYS = 5;
export const INFRA_BUFFER_PROPOSE_DELTA_PCT = 2;

export type WorkersPlanId = 'workers_free' | 'workers_paid' | 'workers_enterprise';
export type ZonePlanId = 'free' | 'lite' | 'pro' | 'pro_plus' | 'business' | 'enterprise' | 'unknown';
export type MetricFamily = 'compute' | 'storage' | 'data' | 'ai' | 'observability' | 'zone' | 'other';
export type MetricStatus = 'under' | 'watch' | 'projected_over' | 'over' | 'hard_stop_today' | 'unavailable';
export type CostSource = 'invoice' | 'catalog_estimate';
export type Confidence = 'low' | 'medium' | 'high';

export type CloudflareUsageErrorCode =
  | 'plans_unreadable'
  | 'token_missing'
  | 'rate_limited'
  | 'catalog_confirm_required'
  | 'apply_confirm_required'
  | 'apply_forbidden'
  | 'rollback_unavailable';

export class CloudflareUsageError extends Error {
  readonly code: CloudflareUsageErrorCode;
  readonly status: 400 | 403 | 429 | 503;

  constructor(code: CloudflareUsageErrorCode, message: string, status: 400 | 403 | 429 | 503) {
    super(message);
    this.name = 'CloudflareUsageError';
    this.code = code;
    this.status = status;
  }
}

export type MetricAllotment = {
  metricId: string;
  family: MetricFamily;
  label: string;
  included: number;
  includedPeriod: 'month' | 'day';
  overageUsdPerUnit: number;
  unit: string;
  unitScale: number;
  roundUp: boolean;
  hardStopWhenExceeded: boolean;
  burstPattern?: boolean;
};

export type PricingCatalog = {
  version: string;
  asOf: string;
  currency: 'USD';
  sourceUrls: string[];
  workersPlan: Record<WorkersPlanId, MetricAllotment[]>;
};

export type ZonePlan = {
  zoneName: string;
  zoneId: string;
  planId: ZonePlanId;
  publicName: string;
  subscriptionUsdPerMonth: number;
  periodStart?: string;
  periodEnd?: string;
};

export type CloudflarePlans = {
  workers: {
    planId: WorkersPlanId;
    publicName: string;
    subscriptionUsdPerMonth: number;
    periodStart: string;
    periodEnd: string;
    state: string;
    source: 'subscriptions_api';
    periodAssumedUtc: boolean;
  };
  zones: ZonePlan[];
  addOns: Array<{ ratePlanId: string; publicName: string; usdPerMonth: number }>;
};

export type UsageBreakdown = {
  key: string;
  label: string;
  usage: number;
  unit: string;
};

export type UsageMetricRow = {
  metricId: string;
  family: MetricFamily;
  label: string;
  planId: WorkersPlanId;
  included: number;
  includedPeriod: 'month' | 'day';
  unit: string;
  usageMtd: number;
  usageToday?: number;
  pctOfIncluded: number | null;
  projectedEom: number;
  exhaustAt: string | null;
  overageNow: number;
  overageProjected: number;
  overageUsdNow: number;
  overageUsdProjected: number;
  rounded: boolean;
  hardStopWhenExceeded: boolean;
  status: MetricStatus;
  confidence: Confidence;
  burstPattern: boolean;
  costSource: CostSource;
  unavailableReason?: string;
  breakdown?: UsageBreakdown[];
};

export type ExhaustMarker = {
  metricId: string;
  label: string;
  at: string;
  status: MetricStatus;
};

export type InventoryItem = {
  kind: string;
  id: string;
  name: string;
  expected: boolean;
  found: boolean;
  status: 'ok' | 'orphan' | 'missing';
  notes: string[];
};

export type Recommendation = {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  metricId?: string;
  because: string;
  actions: string[];
  usdSavedPerMonth: { min: number; max: number };
  effort: 'S' | 'M' | 'L';
  status: 'advisory';
  priorityScore: number;
};

export type OverviewSummary = {
  includedRemainingCount: number;
  trackedMetricCount: number;
  overageUsdNow: number;
  projectedEomUsd: number;
  flatUsd: number;
  variableUsdNow: number;
  variableUsdProjected: number;
  totalUsdNow: number;
  totalUsdProjected: number;
  nextExhaust: ExhaustMarker | null;
  noExhaustThisPeriod: boolean;
};

export type UsageSnapshotPayload = {
  plans: CloudflarePlans;
  metrics: UsageMetricRow[];
  inventory: InventoryItem[];
  recommendations: Recommendation[];
  summary: OverviewSummary;
  catalogVersion: string;
  asOf: string;
  costSource: CostSource;
  accountIdMasked: string;
};

export type OverviewDto = UsageSnapshotPayload & {
  cachedAt: string;
  stale: boolean;
  alerts?: Array<{
    metricId: string;
    label: string;
    exhaustAt: string;
    daysAhead: number;
    overageUsdProjected: number;
  }>;
};

export const CATALOG_SOURCE_URLS = [
  'https://developers.cloudflare.com/workers/platform/pricing/',
  'https://developers.cloudflare.com/d1/platform/pricing/',
  'https://developers.cloudflare.com/r2/pricing/',
  'https://developers.cloudflare.com/kv/platform/pricing/',
  'https://developers.cloudflare.com/vectorize/platform/pricing/',
  'https://developers.cloudflare.com/workers-ai/platform/pricing/',
  'https://developers.cloudflare.com/pipelines/platform/pricing/',
];

function m(
  metricId: string,
  family: MetricFamily,
  label: string,
  included: number,
  includedPeriod: 'month' | 'day',
  overageUsdPerUnit: number,
  unit: string,
  unitScale: number,
  hardStopWhenExceeded: boolean,
  extras?: Partial<Pick<MetricAllotment, 'roundUp' | 'burstPattern'>>,
): MetricAllotment {
  return {
    metricId,
    family,
    label,
    included,
    includedPeriod,
    overageUsdPerUnit,
    unit,
    unitScale,
    roundUp: extras?.roundUp ?? unitScale > 1,
    hardStopWhenExceeded,
    burstPattern: extras?.burstPattern,
  };
}

const MILLION = 1_000_000;

function paidAllotments(): MetricAllotment[] {
  return [
    m('workers.requests', 'compute', 'Workers requests', 10 * MILLION, 'month', 0.3, 'request', MILLION, false),
    m('workers.cpu_ms', 'compute', 'Workers CPU time', 30 * MILLION, 'month', 0.02, 'cpu_ms', MILLION, false, {
      burstPattern: true,
    }),
    m('workers.logs_events', 'observability', 'Workers Logs events', 20 * MILLION, 'month', 0.6, 'event', MILLION, false),
    m('kv.reads', 'storage', 'KV reads', 10 * MILLION, 'month', 0.5, 'read', MILLION, false),
    m('kv.writes', 'storage', 'KV writes', 1 * MILLION, 'month', 5, 'write', MILLION, false),
    m('kv.deletes', 'storage', 'KV deletes', 1 * MILLION, 'month', 5, 'delete', MILLION, false),
    m('kv.lists', 'storage', 'KV lists', 1 * MILLION, 'month', 5, 'list', MILLION, false),
    m('kv.storage_gb', 'storage', 'KV stored data', 1, 'month', 0.5, 'GB-month', 1, false),
    m('d1.rows_read', 'data', 'D1 rows read', 25_000 * MILLION, 'month', 0.001, 'row', MILLION, false),
    m('d1.rows_written', 'data', 'D1 rows written', 50 * MILLION, 'month', 1, 'row', MILLION, false),
    m('d1.storage_gb', 'storage', 'D1 storage', 5, 'month', 0.75, 'GB-month', 1, false),
    m('do.requests', 'compute', 'Durable Object requests', 1 * MILLION, 'month', 0.15, 'request', MILLION, false),
    m('do.duration_gb_s', 'compute', 'Durable Object duration', 400_000, 'month', 12.5, 'GB-s', MILLION, false),
    m('do.sqlite.rows_read', 'data', 'DO SQLite rows read', 25_000 * MILLION, 'month', 0.001, 'row', MILLION, false),
    m('do.sqlite.rows_written', 'data', 'DO SQLite rows written', 50 * MILLION, 'month', 1, 'row', MILLION, false),
    m('do.sqlite.storage_gb', 'storage', 'DO SQLite storage', 5, 'month', 0.2, 'GB-month', 1, false),
    m('queues.operations', 'data', 'Queue operations', 1 * MILLION, 'month', 0.4, 'operation', MILLION, false),
    m('r2.storage_gb', 'storage', 'R2 Standard storage', 10, 'month', 0.015, 'GB-month', 1, false),
    m('r2.class_a', 'storage', 'R2 Class A operations', 1 * MILLION, 'month', 4.5, 'request', MILLION, false),
    m('r2.class_b', 'storage', 'R2 Class B operations', 10 * MILLION, 'month', 0.36, 'request', MILLION, false),
    m('vectorize.queried_dims', 'ai', 'Vectorize queried dimensions', 50 * MILLION, 'month', 0.01, 'dimension', MILLION, false),
    m('vectorize.stored_dims', 'ai', 'Vectorize stored dimensions', 10 * MILLION, 'month', 0.05, 'dimension', 100 * MILLION, false),
    m('workers_ai.neurons', 'ai', 'Workers AI neurons', 10_000, 'day', 0.011, 'neuron', 1_000, false),
    m('images.unique_transformations', 'ai', 'Images unique transformations', 5_000, 'month', 0.5, 'transformation', 1_000, false),
    m('ae.datapoints_written', 'observability', 'Analytics Engine writes', 100_000, 'day', 0.25, 'datapoint', MILLION, false),
    m('pipelines.sql_gb', 'data', 'Pipelines SQL transforms', 50, 'month', 0.04, 'GB', 1, false, { burstPattern: true }),
    m('pipelines.sink_parquet_gb', 'data', 'Pipelines Iceberg/Parquet sink', 50, 'month', 0.06, 'GB', 1, false, {
      burstPattern: true,
    }),
  ];
}

function freeAllotments(): MetricAllotment[] {
  return [
    m('workers.requests', 'compute', 'Workers requests', 100_000, 'day', 0, 'request', 1, true),
    m('workers.cpu_ms', 'compute', 'Workers CPU time', 10, 'day', 0, 'cpu_ms', 1, true, { burstPattern: true, roundUp: false }),
    m('workers.logs_events', 'observability', 'Workers Logs events', 200_000, 'day', 0, 'event', 1, false),
    m('kv.reads', 'storage', 'KV reads', 100_000, 'day', 0, 'read', 1, true),
    m('kv.writes', 'storage', 'KV writes', 1_000, 'day', 0, 'write', 1, true),
    m('kv.deletes', 'storage', 'KV deletes', 1_000, 'day', 0, 'delete', 1, true),
    m('kv.lists', 'storage', 'KV lists', 1_000, 'day', 0, 'list', 1, true),
    m('kv.storage_gb', 'storage', 'KV stored data', 1, 'month', 0, 'GB-month', 1, true),
    m('d1.rows_read', 'data', 'D1 rows read', 5 * MILLION, 'day', 0, 'row', 1, true),
    m('d1.rows_written', 'data', 'D1 rows written', 100_000, 'day', 0, 'row', 1, true),
    m('d1.storage_gb', 'storage', 'D1 storage', 5, 'month', 0, 'GB-month', 1, true),
    m('do.requests', 'compute', 'Durable Object requests', 100_000, 'day', 0, 'request', 1, true),
    m('do.duration_gb_s', 'compute', 'Durable Object duration', 13_000, 'day', 0, 'GB-s', 1, true),
    m('do.sqlite.rows_read', 'data', 'DO SQLite rows read', 5 * MILLION, 'day', 0, 'row', 1, true),
    m('do.sqlite.rows_written', 'data', 'DO SQLite rows written', 100_000, 'day', 0, 'row', 1, true),
    m('do.sqlite.storage_gb', 'storage', 'DO SQLite storage', 5, 'month', 0, 'GB-month', 1, true),
    m('queues.operations', 'data', 'Queue operations', 10_000, 'day', 0, 'operation', 1, true),
    m('r2.storage_gb', 'storage', 'R2 Standard storage', 10, 'month', 0.015, 'GB-month', 1, false),
    m('r2.class_a', 'storage', 'R2 Class A operations', 1 * MILLION, 'month', 4.5, 'request', MILLION, false),
    m('r2.class_b', 'storage', 'R2 Class B operations', 10 * MILLION, 'month', 0.36, 'request', MILLION, false),
    m('vectorize.queried_dims', 'ai', 'Vectorize queried dimensions', 30 * MILLION, 'month', 0, 'dimension', MILLION, false),
    m('vectorize.stored_dims', 'ai', 'Vectorize stored dimensions', 5 * MILLION, 'month', 0, 'dimension', 1, false),
    m('workers_ai.neurons', 'ai', 'Workers AI neurons', 10_000, 'day', 0, 'neuron', 1, true),
    m('images.unique_transformations', 'ai', 'Images unique transformations', 5_000, 'month', 0.5, 'transformation', 1_000, false),
    m('ae.datapoints_written', 'observability', 'Analytics Engine writes', 100_000, 'day', 0, 'datapoint', 1, false),
  ];
}

export function seedPricingCatalog(): PricingCatalog {
  return {
    version: '2026.09.19',
    asOf: '2026-09-19',
    currency: 'USD',
    sourceUrls: CATALOG_SOURCE_URLS,
    workersPlan: {
      workers_free: freeAllotments(),
      workers_paid: paidAllotments(),
      workers_enterprise: [],
    },
  };
}

export function isPricingCatalog(value: unknown): value is PricingCatalog {
  if (!value || typeof value !== 'object') return false;
  const v = value as PricingCatalog;
  return (
    typeof v.version === 'string' &&
    typeof v.asOf === 'string' &&
    !!v.workersPlan &&
    Array.isArray(v.workersPlan.workers_paid) &&
    Array.isArray(v.workersPlan.workers_free)
  );
}

export function allotmentsForPlan(catalog: PricingCatalog, planId: WorkersPlanId): MetricAllotment[] {
  if (planId === 'workers_enterprise') return catalog.workersPlan.workers_enterprise;
  return catalog.workersPlan[planId] ?? catalog.workersPlan.workers_free;
}

export function maskAccountId(accountId: string): string {
  const id = accountId.trim();
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function utcMonthPeriod(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function utcDayDiff(from: Date, to: Date): number {
  const a = utcDayStart(from).getTime();
  const b = utcDayStart(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function workersSubscriptionUsd(planId: WorkersPlanId): number {
  if (planId === 'workers_paid') return 5;
  return 0;
}
