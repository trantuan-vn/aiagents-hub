import {
  CloudflareUsageError,
  CF_API_TIMEOUT_MS,
  parseIsoDate,
  utcMonthPeriod,
  workersSubscriptionUsd,
  type CloudflarePlans,
  type UsageBreakdown,
  type WorkersPlanId,
  type ZonePlanId,
} from './domain.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

export type FoundResource = { kind: string; id: string; name: string };

export type RawMetricUsage = {
  mtd: number;
  today?: number;
  breakdown?: UsageBreakdown[];
  source: 'graphql' | 'billable';
  hourUtcCpuMs?: Record<number, number>;
};

export type BillableRow = {
  metricId: string | null;
  rawId: string;
  rawName: string;
  consumed: number;
  billedUsd: number | null;
};

export type CloudflareFetchResult = {
  plans: CloudflarePlans;
  inventory: FoundResource[];
  usage: Record<string, RawMetricUsage>;
  billable: BillableRow[];
  partialErrors: string[];
  /** metricId -> why GraphQL could not provide it */
  unreadableMetrics: Record<string, string>;
};

type Json = Record<string, unknown>;

async function cfFetch(token: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Json }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CF_API_TIMEOUT_MS);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    let body: Json = {};
    try {
      body = (await res.json()) as Json;
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function readUsageToken(env: Env): Promise<string> {
  const binding = (env as Env & { CLOUDFLARE_USAGE_API_TOKEN?: SecretsStoreSecret }).CLOUDFLARE_USAGE_API_TOKEN;
  if (!binding) {
    throw new CloudflareUsageError('token_missing', 'CLOUDFLARE_USAGE_API_TOKEN is not bound', 503);
  }
  let token: string;
  try {
    token = await binding.get();
  } catch {
    throw new CloudflareUsageError('token_missing', 'CLOUDFLARE_USAGE_API_TOKEN could not be read', 503);
  }
  if (!token?.trim()) {
    throw new CloudflareUsageError('token_missing', 'CLOUDFLARE_USAGE_API_TOKEN is empty', 503);
  }
  return token.trim();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type CfSubscription = {
  id?: string;
  currency?: string;
  current_period_start?: string;
  current_period_end?: string;
  price?: number;
  state?: string;
  rate_plan?: {
    id?: string;
    public_name?: string;
    scope?: string;
  };
};

function classifyWorkersPlan(subs: CfSubscription[]): {
  planId: WorkersPlanId;
  publicName: string;
  state: string;
  periodStart?: string;
  periodEnd?: string;
  price: number;
} {
  const account = subs.filter((s) => (s.rate_plan?.scope ?? 'account') !== 'zone');
  const enterprise = account.find((s) => {
    const id = (s.rate_plan?.id ?? '').toLowerCase();
    const name = (s.rate_plan?.public_name ?? '').toLowerCase();
    return id.includes('workers_enterprise') || id.includes('enterprise') && name.includes('worker');
  });
  if (enterprise) {
    return {
      planId: 'workers_enterprise',
      publicName: enterprise.rate_plan?.public_name ?? 'Workers Enterprise',
      state: enterprise.state ?? 'Paid',
      periodStart: enterprise.current_period_start,
      periodEnd: enterprise.current_period_end,
      price: num(enterprise.price),
    };
  }
  const paid = account.find((s) => (s.rate_plan?.id ?? '').toLowerCase() === 'workers_paid');
  if (paid) {
    return {
      planId: 'workers_paid',
      publicName: paid.rate_plan?.public_name ?? 'Workers Paid',
      state: paid.state ?? 'Paid',
      periodStart: paid.current_period_start,
      periodEnd: paid.current_period_end,
      price: num(paid.price) || 5,
    };
  }
  return { planId: 'workers_free', publicName: 'Workers Free', state: 'Free', price: 0 };
}

const ZONE_PLAN_IDS = new Set<ZonePlanId>(['free', 'lite', 'pro', 'pro_plus', 'business', 'enterprise']);

function asZonePlanId(id: string): ZonePlanId {
  const lower = id.toLowerCase() as ZonePlanId;
  return ZONE_PLAN_IDS.has(lower) ? lower : 'unknown';
}

export function parseSubscriptions(subs: CfSubscription[], now: Date, accountId: string): CloudflarePlans {
  void accountId;
  const classified = classifyWorkersPlan(subs);
  const utc = utcMonthPeriod(now);
  const start = parseIsoDate(classified.periodStart) ?? utc.start;
  const end = parseIsoDate(classified.periodEnd) ?? utc.end;
  const periodAssumedUtc = !classified.periodStart || !classified.periodEnd;

  const addOns: CloudflarePlans['addOns'] = [];
  for (const s of subs) {
    const id = (s.rate_plan?.id ?? '').toLowerCase();
    const scope = s.rate_plan?.scope;
    if (scope === 'zone') continue;
    if (id === 'workers_paid' || id.includes('workers_enterprise')) continue;
    if (!id) continue;
    addOns.push({
      ratePlanId: s.rate_plan?.id ?? id,
      publicName: s.rate_plan?.public_name ?? id,
      usdPerMonth: num(s.price),
    });
  }

  return {
    workers: {
      planId: classified.planId,
      publicName: classified.publicName,
      subscriptionUsdPerMonth: classified.planId === 'workers_paid' ? workersSubscriptionUsd('workers_paid') : classified.price,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      state: classified.state,
      source: 'subscriptions_api',
      periodAssumedUtc,
    },
    zones: [],
    addOns,
  };
}

async function fetchSubscriptions(token: string, accountId: string, now: Date): Promise<CloudflarePlans> {
  const res = await cfFetch(token, `/accounts/${accountId}/subscriptions`);
  if (res.status === 401 || res.status === 403) {
    throw new CloudflareUsageError(
      'plans_unreadable',
      'Cloudflare token lacks Billing Read / Account Settings Read — cannot detect Workers plan',
      503,
    );
  }
  if (!res.ok) {
    throw new CloudflareUsageError('plans_unreadable', `Cloudflare subscriptions API returned ${res.status}`, 503);
  }
  return parseSubscriptions(asArray<CfSubscription>(res.body.result), now, accountId);
}

async function fetchZones(token: string, errors: string[]): Promise<CloudflarePlans['zones']> {
  const list = await cfFetch(token, `/zones?name=aiagents-hub.vn`);
  if (!list.ok) {
    errors.push(`zones:${list.status}`);
    return [];
  }
  const zones = asArray<{ id: string; name: string }>(list.body.result);
  const out: CloudflarePlans['zones'] = [];
  for (const zone of zones) {
    const sub = await cfFetch(token, `/zones/${zone.id}/subscription`);
    if (!sub.ok) {
      errors.push(`zone_sub:${zone.name}:${sub.status}`);
      out.push({
        zoneName: zone.name,
        zoneId: zone.id,
        planId: 'unknown',
        publicName: 'unknown',
        subscriptionUsdPerMonth: 0,
      });
      continue;
    }
    const result = (sub.body.result ?? {}) as CfSubscription;
    out.push({
      zoneName: zone.name,
      zoneId: zone.id,
      planId: asZonePlanId(result.rate_plan?.id ?? 'unknown'),
      publicName: result.rate_plan?.public_name ?? result.rate_plan?.id ?? 'unknown',
      subscriptionUsdPerMonth: num(result.price),
      periodStart: result.current_period_start,
      periodEnd: result.current_period_end,
    });
  }
  return out;
}

async function listPath(
  token: string,
  path: string,
  map: (row: Json) => FoundResource | null,
  errors: string[],
  label: string,
): Promise<FoundResource[]> {
  const res = await cfFetch(token, path);
  if (!res.ok) {
    errors.push(`${label}:${res.status}`);
    return [];
  }
  const rows = asArray<Json>(res.body.result);
  const out: FoundResource[] = [];
  for (const row of rows) {
    const mapped = map(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function fetchInventory(token: string, accountId: string, errors: string[]): Promise<FoundResource[]> {
  const parts = await Promise.all([
    listPath(token, `/accounts/${accountId}/workers/scripts`, (r) => ({ kind: 'worker', id: str(r.id) || str(r.name), name: str(r.id) || str(r.name) }), errors, 'workers'),
    listPath(token, `/accounts/${accountId}/d1/database`, (r) => ({ kind: 'd1', id: str(r.uuid) || str(r.id), name: str(r.name) }), errors, 'd1'),
    listPath(token, `/accounts/${accountId}/r2/buckets`, (r) => ({ kind: 'r2', id: str(r.name), name: str(r.name) }), errors, 'r2'),
    listPath(token, `/accounts/${accountId}/storage/kv/namespaces`, (r) => ({ kind: 'kv', id: str(r.id), name: str(r.title) || str(r.id) }), errors, 'kv'),
    listPath(token, `/accounts/${accountId}/queues`, (r) => ({ kind: 'queue', id: str(r.queue_name) || str(r.queue_id) || str(r.id), name: str(r.queue_name) || str(r.id) }), errors, 'queues'),
    listPath(token, `/accounts/${accountId}/vectorize/indexes`, (r) => ({ kind: 'vectorize', id: str(r.name) || str(r.id), name: str(r.name) }), errors, 'vectorize'),
    listPath(token, `/accounts/${accountId}/ai-gateway/gateways`, (r) => ({ kind: 'ai-gateway', id: str(r.id) || str(r.name), name: str(r.id) || str(r.name) }), errors, 'ai-gateway'),
  ]);
  return parts.flat().filter((r) => r.id);
}

function gqlDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T | null; error?: string }> {
  const res = await cfFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return { data: null, error: `http_${res.status}` };
  const errors = asArray<{ message?: string }>(res.body.errors);
  if (errors.length) return { data: null, error: errors[0]?.message || 'graphql_error' };
  const data = (res.body.data as T) ?? null;
  return data ? { data } : { data: null, error: 'empty_data' };
}

type GqlGroup = {
  sum?: Record<string, unknown>;
  max?: Record<string, unknown>;
  uniq?: Record<string, unknown>;
  count?: number;
  quantiles?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
  date?: unknown;
  transformations?: unknown;
};

const KV_NAMESPACE_LABELS: Record<string, string> = {
  e80315e1a3fb47e2959d645a15ac534a: 'SYSTEM_CONFIG_KV',
  '529353fcfe7641c9bcbd5dda5d01d5da': 'SYSTEM_CONFIG_KV (unused leftover)',
  dfbfc6ec8f75482bbf54854d86442e27: 'NONCE_KV',
};

function addUsage(map: Record<string, RawMetricUsage>, metricId: string, amount: number, breakdown?: UsageBreakdown): void {
  if (!Number.isFinite(amount) || amount < 0) return;
  const cur = map[metricId] ?? { mtd: 0, source: 'graphql' as const };
  cur.mtd += amount;
  if (breakdown) {
    cur.breakdown = cur.breakdown ?? [];
    const existing = cur.breakdown.find((b) => b.key === breakdown.key);
    if (existing) existing.usage += breakdown.usage;
    else cur.breakdown.push(breakdown);
  }
  map[metricId] = cur;
}

function sortAndCapBreakdowns(usage: Record<string, RawMetricUsage>, cap = 40): void {
  for (const row of Object.values(usage)) {
    if (!row.breakdown?.length) continue;
    row.breakdown.sort((a, b) => b.usage - a.usage);
    if (row.breakdown.length > cap) row.breakdown = row.breakdown.slice(0, cap);
  }
}

type GqlAccounts = { viewer?: { accounts?: Array<Record<string, GqlGroup[] | undefined>> } };

function gqlField(data: GqlAccounts | null, field: string): GqlGroup[] {
  return data?.viewer?.accounts?.[0]?.[field] ?? [];
}

/** Metrics with no account-scoped GraphQL dataset — only Billable Usage can fill them. */
export const NO_GRAPHQL_METRIC_IDS = ['workers.logs_events', 'pipelines.sql_gb', 'pipelines.sink_parquet_gb'];

type QueryContext = { errors: string[]; unreadable: Map<string, string> };

async function runAccountQuery(
  token: string,
  ctx: QueryContext,
  spec: { node: string; metricIds: string[]; query: string; variables: Record<string, unknown> },
): Promise<GqlGroup[] | null> {
  const { data, error } = await graphql<GqlAccounts>(token, spec.query, spec.variables);
  if (!data) {
    const reason = `${spec.node}: ${error ?? 'unknown'}`;
    ctx.errors.push(`graphql:${reason}`);
    for (const id of spec.metricIds) ctx.unreadable.set(id, reason);
    return null;
  }
  return gqlField(data, spec.node);
}

/** Sums the per-key maximum, for point-in-time metrics such as stored bytes. */
function addMaxByKey(
  usage: Record<string, RawMetricUsage>,
  metricId: string,
  groups: GqlGroup[],
  read: (g: GqlGroup) => { key: string; label?: string; value: number },
  unit: string,
): void {
  const byKey = new Map<string, { label: string; value: number }>();
  for (const g of groups) {
    const { key, label, value } = read(g);
    const prev = byKey.get(key);
    if (!prev || value > prev.value) byKey.set(key, { label: label ?? key, value });
  }
  for (const [key, { label, value }] of byKey) {
    addUsage(usage, metricId, value, { key, label, usage: value, unit });
  }
}

const BYTES_PER_GB = 1_000_000_000;

export async function fetchGraphQlUsage(
  token: string,
  accountId: string,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
  errors: string[],
): Promise<{ usage: Record<string, RawMetricUsage>; unreadableMetrics: Record<string, string> }> {
  const usage: Record<string, RawMetricUsage> = {};
  const ctx: QueryContext = {
    errors,
    unreadable: new Map(NO_GRAPHQL_METRIC_IDS.map((id) => [id, 'no_graphql_dataset'])),
  };
  const start = gqlDate(periodStart);
  const end = gqlDate(now < periodEnd ? now : periodEnd);
  const today = gqlDate(now);
  const vars = { accountTag: accountId, start, end };
  const todayVars = { accountTag: accountId, start: today, end: today };

  const workersQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests errors cpuTimeUs }
            dimensions { scriptName }
          }
        }
      }
    }`;
  const d1Query = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { rowsRead rowsWritten }
            dimensions { databaseId }
          }
        }
      }
    }`;
  const d1StorageQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { databaseSizeBytes }
            dimensions { databaseId }
          }
        }
      }
    }`;
  const kvQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests }
            dimensions { actionType namespaceId }
          }
        }
      }
    }`;
  const kvStorageQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvStorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { byteCount }
            dimensions { namespaceId }
          }
        }
      }
    }`;
  const r2OpsQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests }
            dimensions { actionType bucketName }
          }
        }
      }
    }`;
  const r2StorageQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { payloadSize }
            dimensions { bucketName }
          }
        }
      }
    }`;
  const doQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests }
            dimensions { namespaceId scriptName }
          }
        }
      }
    }`;
  const doPeriodicQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          durableObjectsPeriodicGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { duration rowsRead rowsWritten }
            dimensions { namespaceId }
          }
        }
      }
    }`;
  const doSqlStorageQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          durableObjectsSqlStorageGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { storedBytes }
            dimensions { namespaceId }
          }
        }
      }
    }`;
  const queuesQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          queueMessageOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { billableOperations }
            dimensions { queueId actionType }
          }
        }
      }
    }`;
  const vectorizeQueriesQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          vectorizeV2QueriesAdaptiveGroups(
            limit: 10000,
            filter: { date_geq: $start, date_leq: $end, requestStatus: "2xx" }
          ) {
            sum { queriedVectorDimensions }
            dimensions { indexName }
          }
        }
      }
    }`;
  const vectorizeStorageQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          vectorizeV2StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { storedVectorDimensions }
            dimensions { indexName }
          }
        }
      }
    }`;
  const aiQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          aiInferenceAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { totalNeurons }
            dimensions { modelId }
          }
        }
      }
    }`;
  const imagesQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          imagesUniqueTransformationsAccumulatedSinceStartOfMonth(
            limit: 10000,
            filter: { date_geq: $start, date_leq: $end }
          ) {
            date
            transformations
          }
        }
      }
    }`;
  const cronQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!, $script: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000,
            filter: { date_geq: $start, date_leq: $end, scriptName: $script }
          ) {
            sum { cpuTimeUs }
            dimensions { datetimeHour }
          }
        }
      }
    }`;
  const aeQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersAnalyticsEngineAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            count
            dimensions { dataset }
          }
        }
      }
    }`;

  const run = (node: string, metricIds: string[], query: string, variables: Record<string, unknown> = vars) =>
    runAccountQuery(token, ctx, { node, metricIds, query, variables });

  const [
    workers,
    d1,
    d1Storage,
    kv,
    kvStorage,
    r2,
    r2Storage,
    durable,
    durablePeriodic,
    durableSqlStorage,
    queues,
    vectorizeQueries,
    vectorizeStorage,
    ai,
    images,
    cron,
    ae,
    todayWorkers,
    todayD1,
    todayAi,
    todayAe,
  ] = await Promise.all([
    run('workersInvocationsAdaptive', ['workers.requests', 'workers.cpu_ms'], workersQuery),
    run('d1AnalyticsAdaptiveGroups', ['d1.rows_read', 'd1.rows_written'], d1Query),
    run('d1StorageAdaptiveGroups', ['d1.storage_gb'], d1StorageQuery),
    run('kvOperationsAdaptiveGroups', ['kv.reads', 'kv.writes', 'kv.deletes', 'kv.lists'], kvQuery),
    run('kvStorageAdaptiveGroups', ['kv.storage_gb'], kvStorageQuery),
    run('r2OperationsAdaptiveGroups', ['r2.class_a', 'r2.class_b'], r2OpsQuery),
    run('r2StorageAdaptiveGroups', ['r2.storage_gb'], r2StorageQuery),
    run('durableObjectsInvocationsAdaptiveGroups', ['do.requests'], doQuery),
    run(
      'durableObjectsPeriodicGroups',
      ['do.duration_gb_s', 'do.sqlite.rows_read', 'do.sqlite.rows_written'],
      doPeriodicQuery,
    ),
    run('durableObjectsSqlStorageGroups', ['do.sqlite.storage_gb'], doSqlStorageQuery),
    run('queueMessageOperationsAdaptiveGroups', ['queues.operations'], queuesQuery),
    run('vectorizeV2QueriesAdaptiveGroups', ['vectorize.queried_dims'], vectorizeQueriesQuery),
    run('vectorizeV2StorageAdaptiveGroups', ['vectorize.stored_dims'], vectorizeStorageQuery),
    run('aiInferenceAdaptiveGroups', ['workers_ai.neurons'], aiQuery),
    run('imagesUniqueTransformationsAccumulatedSinceStartOfMonth', ['images.unique_transformations'], imagesQuery),
    run('workersInvocationsAdaptive', [], cronQuery, { ...vars, script: 'aiagents-hub-d1tor2-cron' }),
    run('workersAnalyticsEngineAdaptiveGroups', ['ae.datapoints_written'], aeQuery),
    run('workersInvocationsAdaptive', [], workersQuery, todayVars),
    run('d1AnalyticsAdaptiveGroups', [], d1Query, todayVars),
    run('aiInferenceAdaptiveGroups', [], aiQuery, todayVars),
    run('workersAnalyticsEngineAdaptiveGroups', [], aeQuery, todayVars),
  ]);

  if (workers) {
    for (const g of workers) {
      const name = str(g.dimensions?.scriptName) || 'unknown';
      const requests = num(g.sum?.requests);
      const cpuMs = num(g.sum?.cpuTimeUs) / 1000;
      addUsage(usage, 'workers.requests', requests, { key: name, label: name, usage: requests, unit: 'request' });
      addUsage(usage, 'workers.cpu_ms', cpuMs, { key: name, label: name, usage: cpuMs, unit: 'cpu_ms' });
    }
  }

  if (d1) {
    for (const g of d1) {
      const id = str(g.dimensions?.databaseId) || 'd1';
      addUsage(usage, 'd1.rows_read', num(g.sum?.rowsRead), { key: id, label: id, usage: num(g.sum?.rowsRead), unit: 'row' });
      addUsage(usage, 'd1.rows_written', num(g.sum?.rowsWritten), { key: id, label: id, usage: num(g.sum?.rowsWritten), unit: 'row' });
    }
  }

  if (d1Storage) {
    addMaxByKey(
      usage,
      'd1.storage_gb',
      d1Storage,
      (g) => ({ key: str(g.dimensions?.databaseId) || 'd1', value: num(g.max?.databaseSizeBytes) / BYTES_PER_GB }),
      'GB',
    );
  }

  if (kv) {
    for (const g of kv) {
      const action = str(g.dimensions?.actionType).toLowerCase();
      const ns = str(g.dimensions?.namespaceId);
      const n = num(g.sum?.requests);
      const label = KV_NAMESPACE_LABELS[ns] || ns || 'kv';
      const bd = ns ? { key: ns, label, usage: n, unit: 'request' } : undefined;
      if (action.includes('read') || action === 'get') addUsage(usage, 'kv.reads', n, bd);
      else if (action.includes('write') || action === 'put') addUsage(usage, 'kv.writes', n, bd);
      else if (action.includes('delete')) addUsage(usage, 'kv.deletes', n, bd);
      else if (action.includes('list')) addUsage(usage, 'kv.lists', n, bd);
    }
  }

  if (kvStorage) {
    addMaxByKey(
      usage,
      'kv.storage_gb',
      kvStorage,
      (g) => {
        const ns = str(g.dimensions?.namespaceId) || 'kv';
        return { key: ns, label: KV_NAMESPACE_LABELS[ns] || ns, value: num(g.max?.byteCount) / BYTES_PER_GB };
      },
      'GB',
    );
  }

  if (r2) {
    for (const g of r2) {
      const action = str(g.dimensions?.actionType).toLowerCase();
      const bucket = str(g.dimensions?.bucketName) || 'r2';
      const n = num(g.sum?.requests);
      const classA = action.includes('put') || action.includes('list') || action.includes('copy') || action.includes('create');
      const metric = classA ? 'r2.class_a' : 'r2.class_b';
      addUsage(usage, metric, n, { key: bucket, label: bucket, usage: n, unit: 'request' });
    }
  }

  if (r2Storage) {
    addMaxByKey(
      usage,
      'r2.storage_gb',
      r2Storage,
      (g) => ({ key: str(g.dimensions?.bucketName) || 'r2', value: num(g.max?.payloadSize) / BYTES_PER_GB }),
      'GB',
    );
  }

  if (durable) {
    for (const g of durable) {
      const ns = str(g.dimensions?.scriptName) || str(g.dimensions?.namespaceId) || 'do';
      addUsage(usage, 'do.requests', num(g.sum?.requests), { key: ns, label: ns, usage: num(g.sum?.requests), unit: 'request' });
    }
  }

  if (durablePeriodic) {
    for (const g of durablePeriodic) {
      const ns = str(g.dimensions?.namespaceId) || 'do';
      const duration = num(g.sum?.duration);
      const rowsRead = num(g.sum?.rowsRead);
      const rowsWritten = num(g.sum?.rowsWritten);
      addUsage(usage, 'do.duration_gb_s', duration, { key: ns, label: ns, usage: duration, unit: 'GB-s' });
      addUsage(usage, 'do.sqlite.rows_read', rowsRead, { key: ns, label: ns, usage: rowsRead, unit: 'row' });
      addUsage(usage, 'do.sqlite.rows_written', rowsWritten, { key: ns, label: ns, usage: rowsWritten, unit: 'row' });
    }
  }

  if (durableSqlStorage) {
    addMaxByKey(
      usage,
      'do.sqlite.storage_gb',
      durableSqlStorage,
      (g) => ({ key: str(g.dimensions?.namespaceId) || 'do', value: num(g.max?.storedBytes) / BYTES_PER_GB }),
      'GB',
    );
  }

  if (queues) {
    for (const g of queues) {
      const name = str(g.dimensions?.queueId) || 'queue';
      const n = num(g.sum?.billableOperations);
      addUsage(usage, 'queues.operations', n, { key: name, label: name, usage: n, unit: 'operation' });
    }
  }

  if (vectorizeQueries) {
    for (const g of vectorizeQueries) {
      const name = str(g.dimensions?.indexName) || 'vectorize';
      const dims = num(g.sum?.queriedVectorDimensions);
      addUsage(usage, 'vectorize.queried_dims', dims, { key: name, label: name, usage: dims, unit: 'dimension' });
    }
  }

  if (vectorizeStorage) {
    addMaxByKey(
      usage,
      'vectorize.stored_dims',
      vectorizeStorage,
      (g) => ({ key: str(g.dimensions?.indexName) || 'vectorize', value: num(g.max?.storedVectorDimensions) }),
      'dimension',
    );
  }

  if (ai) {
    for (const g of ai) {
      const model = str(g.dimensions?.modelId) || 'workers-ai';
      const neurons = num(g.sum?.totalNeurons);
      addUsage(usage, 'workers_ai.neurons', neurons, { key: model, label: model, usage: neurons, unit: 'neuron' });
    }
  }

  if (images) {
    // The dataset already accumulates unique transformations since the start of the month.
    const peak = images.reduce((max, g) => Math.max(max, num(g.transformations)), 0);
    addUsage(usage, 'images.unique_transformations', peak);
  }

  if (cron) {
    const hours: Record<number, number> = {};
    for (const g of cron) {
      const hourRaw = str(g.dimensions?.datetimeHour);
      const hour = hourRaw ? new Date(hourRaw).getUTCHours() : Number.NaN;
      if (!Number.isFinite(hour)) continue;
      hours[hour] = (hours[hour] ?? 0) + num(g.sum?.cpuTimeUs) / 1000;
    }
    if (Object.keys(hours).length) {
      const cpu = usage['workers.cpu_ms'] ?? { mtd: 0, source: 'graphql' as const };
      cpu.hourUtcCpuMs = hours;
      usage['workers.cpu_ms'] = cpu;
    }
  }

  if (ae) {
    for (const g of ae) {
      const dataset = str(g.dimensions?.dataset) || 'ae';
      const n = num(g.count);
      addUsage(usage, 'ae.datapoints_written', n, { key: dataset, label: dataset, usage: n, unit: 'datapoint' });
    }
  }

  if (todayWorkers) {
    let todayReq = 0;
    let todayCpu = 0;
    for (const g of todayWorkers) {
      todayReq += num(g.sum?.requests);
      todayCpu += num(g.sum?.cpuTimeUs) / 1000;
    }
    if (usage['workers.requests']) usage['workers.requests'].today = todayReq;
    if (usage['workers.cpu_ms']) usage['workers.cpu_ms'].today = todayCpu;
  }

  if (todayD1) {
    let read = 0;
    let written = 0;
    for (const g of todayD1) {
      read += num(g.sum?.rowsRead);
      written += num(g.sum?.rowsWritten);
    }
    if (usage['d1.rows_read']) usage['d1.rows_read'].today = read;
    if (usage['d1.rows_written']) usage['d1.rows_written'].today = written;
  }

  if (todayAi) {
    let neurons = 0;
    for (const g of todayAi) {
      neurons += num(g.sum?.totalNeurons);
    }
    if (usage['workers_ai.neurons']) usage['workers_ai.neurons'].today = neurons;
  }

  if (todayAe) {
    let points = 0;
    for (const g of todayAe) {
      points += num(g.count);
    }
    if (usage['ae.datapoints_written']) usage['ae.datapoints_written'].today = points;
  }

  sortAndCapBreakdowns(usage);
  return { usage, unreadableMetrics: Object.fromEntries(ctx.unreadable) };
}

export const BILLABLE_METRIC_MAP: Record<string, string> = {
  workers_standard_requests: 'workers.requests',
  workers_standard_cpu: 'workers.cpu_ms',
  workers_cpu_time: 'workers.cpu_ms',
  workers_logs: 'workers.logs_events',
  workers_log_events: 'workers.logs_events',
  kv_read: 'kv.reads',
  kv_reads: 'kv.reads',
  kv_write: 'kv.writes',
  kv_writes: 'kv.writes',
  kv_delete: 'kv.deletes',
  kv_list: 'kv.lists',
  kv_storage: 'kv.storage_gb',
  d1_rows_read: 'd1.rows_read',
  d1_rows_written: 'd1.rows_written',
  d1_storage: 'd1.storage_gb',
  durable_objects_requests: 'do.requests',
  durable_objects_duration: 'do.duration_gb_s',
  durable_objects_sqlite_rows_read: 'do.sqlite.rows_read',
  durable_objects_sqlite_rows_written: 'do.sqlite.rows_written',
  queues_operations: 'queues.operations',
  r2_storage: 'r2.storage_gb',
  r2_class_a: 'r2.class_a',
  r2_class_b: 'r2.class_b',
  vectorize_queried: 'vectorize.queried_dims',
  vectorize_stored: 'vectorize.stored_dims',
  workers_ai_neurons: 'workers_ai.neurons',
  images_unique_transformations: 'images.unique_transformations',
  analytics_engine_writes: 'ae.datapoints_written',
  pipelines_sql: 'pipelines.sql_gb',
  pipelines_sink: 'pipelines.sink_parquet_gb',
};

export function mapBillableMetricId(rawId: string, rawName: string): string | null {
  const id = rawId.toLowerCase().replace(/[\s-]+/g, '_');
  if (BILLABLE_METRIC_MAP[id]) return BILLABLE_METRIC_MAP[id];
  const name = `${rawId} ${rawName}`.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/workers.*request/, 'workers.requests'],
    [/cpu/, 'workers.cpu_ms'],
    [/workers.?log/, 'workers.logs_events'],
    [/kv.*read/, 'kv.reads'],
    [/kv.*write/, 'kv.writes'],
    [/d1.*read/, 'd1.rows_read'],
    [/d1.*writ/, 'd1.rows_written'],
    [/d1.*stor/, 'd1.storage_gb'],
    [/durable.*request/, 'do.requests'],
    [/durable.*duration|gb-s|gb_s/, 'do.duration_gb_s'],
    [/queue/, 'queues.operations'],
    [/r2.*class.?a/, 'r2.class_a'],
    [/r2.*class.?b/, 'r2.class_b'],
    [/r2.*stor/, 'r2.storage_gb'],
    [/vectorize.*quer/, 'vectorize.queried_dims'],
    [/vectorize.*stor/, 'vectorize.stored_dims'],
    [/neuron|workers.?ai/, 'workers_ai.neurons'],
    [/image.*transform/, 'images.unique_transformations'],
    [/analytics engine/, 'ae.datapoints_written'],
    [/pipeline.*sql/, 'pipelines.sql_gb'],
    [/pipeline.*sink|iceberg|parquet/, 'pipelines.sink_parquet_gb'],
  ];
  for (const [re, metricId] of pairs) {
    if (re.test(name)) return metricId;
  }
  return null;
}

function pickBilledUsd(row: Json): number | null {
  for (const key of ['BilledCost', 'EffectiveCost', 'ContractedCost'] as const) {
    const v = row[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

async function fetchBillableRange(token: string, accountId: string, from: string, to: string): Promise<{ rows: Json[]; ok: boolean; status: number }> {
  const res = await cfFetch(token, `/accounts/${accountId}/billable/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return { rows: asArray<Json>(res.body.result), ok: res.ok, status: res.status };
}

export async function fetchBillableUsage(
  token: string,
  accountId: string,
  periodStart: Date,
  now: Date,
  errors: string[],
): Promise<BillableRow[]> {
  const start = gqlDate(periodStart);
  const end = gqlDate(now);
  const ms = now.getTime() - periodStart.getTime();
  const chunks: Array<{ from: string; to: string }> = [];
  if (ms <= 31 * 86_400_000) {
    chunks.push({ from: start, to: end });
  } else {
    const mid = new Date(periodStart.getTime() + 30 * 86_400_000);
    chunks.push({ from: start, to: gqlDate(mid) }, { from: gqlDate(mid), to: end });
  }

  const out: BillableRow[] = [];
  for (const chunk of chunks) {
    const { rows, ok, status } = await fetchBillableRange(token, accountId, chunk.from, chunk.to);
    if (!ok) {
      errors.push(`billable:${status}`);
      continue;
    }
    for (const row of rows) {
      const rawId = str(row.x_BillableMetricId);
      const rawName = str(row.x_BillableMetricName) || str(row.ChargeDescription);
      out.push({
        metricId: mapBillableMetricId(rawId, rawName),
        rawId: rawId || rawName || 'unknown',
        rawName: rawName || rawId || 'unknown',
        consumed: num(row.ConsumedQuantity ?? row.PricingQuantity),
        billedUsd: pickBilledUsd(row),
      });
    }
  }
  return out;
}

export function mergeBillableIntoUsage(
  usage: Record<string, RawMetricUsage>,
  billable: BillableRow[],
): { invoiceUsd: Record<string, number>; unmapped: BillableRow[] } {
  const invoiceUsd: Record<string, number> = {};
  const unmapped: BillableRow[] = [];
  const consumed: Record<string, number> = {};
  for (const row of billable) {
    if (!row.metricId) {
      unmapped.push(row);
      continue;
    }
    consumed[row.metricId] = (consumed[row.metricId] ?? 0) + row.consumed;
    if (row.billedUsd != null) invoiceUsd[row.metricId] = (invoiceUsd[row.metricId] ?? 0) + row.billedUsd;
  }
  for (const [metricId, amount] of Object.entries(consumed)) {
    if (!usage[metricId] || usage[metricId].mtd <= 0) {
      usage[metricId] = { mtd: amount, source: 'billable' };
    }
  }
  return { invoiceUsd, unmapped };
}

export async function fetchCloudflareUsage(env: Env, now: Date): Promise<CloudflareFetchResult> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const partialErrors: string[] = [];
  const plans = await fetchSubscriptions(token, accountId, now);
  try {
    plans.zones = await fetchZones(token, partialErrors);
  } catch (err) {
    partialErrors.push(`zones:${err instanceof Error ? err.message : String(err)}`);
  }
  const periodStart = parseIsoDate(plans.workers.periodStart) ?? utcMonthPeriod(now).start;
  const periodEnd = parseIsoDate(plans.workers.periodEnd) ?? utcMonthPeriod(now).end;

  const [inventory, graphqlUsage, billable] = await Promise.all([
    fetchInventory(token, accountId, partialErrors),
    fetchGraphQlUsage(token, accountId, periodStart, periodEnd, now, partialErrors),
    fetchBillableUsage(token, accountId, periodStart, now, partialErrors),
  ]);

  return {
    plans,
    inventory,
    usage: graphqlUsage.usage,
    billable,
    partialErrors,
    unreadableMetrics: graphqlUsage.unreadableMetrics,
  };
}

export type WorkerObservabilitySettings = {
  scriptName: string;
  enabled: boolean;
  headSamplingRate: number | null;
  readable: boolean;
  writableHint: boolean;
  error?: string;
};

function parseHeadSamplingRate(obs: Json | undefined): number | null {
  if (!obs) return null;
  if (typeof obs.head_sampling_rate === 'number' && Number.isFinite(obs.head_sampling_rate)) {
    return obs.head_sampling_rate;
  }
  const logs = obs.logs && typeof obs.logs === 'object' ? (obs.logs as Json).head_sampling_rate : undefined;
  if (typeof logs === 'number' && Number.isFinite(logs)) return logs;
  return null;
}

async function fetchScriptSettings(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<{ ok: boolean; status: number; body: Json }> {
  const primary = await cfFetch(token, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/script-settings`);
  if (primary.ok || (primary.status !== 404 && primary.status !== 405)) return primary;
  return cfFetch(token, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/settings`);
}

export async function getWorkerObservability(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<WorkerObservabilitySettings> {
  const res = await fetchScriptSettings(token, accountId, scriptName);
  if (!res.ok) {
    return {
      scriptName,
      enabled: false,
      headSamplingRate: null,
      readable: false,
      writableHint: res.status !== 403 && res.status !== 401,
      error: `settings:${res.status}`,
    };
  }
  const result = (res.body.result ?? {}) as Json;
  const obs = (result.observability ?? {}) as Json;
  const enabled = Boolean(obs.enabled);
  return {
    scriptName,
    enabled,
    headSamplingRate: parseHeadSamplingRate(obs) ?? (enabled ? 1 : null),
    readable: true,
    writableHint: true,
  };
}

export async function patchWorkerObservability(
  token: string,
  accountId: string,
  scriptName: string,
  headSamplingRate: number,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const payload = {
    observability: {
      enabled: true,
      head_sampling_rate: headSamplingRate,
      logs: {
        enabled: true,
        invocation_logs: true,
        head_sampling_rate: headSamplingRate,
      },
    },
  };
  let res = await cfFetch(token, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/script-settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok && (res.status === 404 || res.status === 405)) {
    res = await cfFetch(token, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }
  if (res.ok) return { ok: true, status: res.status };
  const err = asArray<{ message?: string }>(res.body.errors)[0];
  return { ok: false, status: res.status, error: err?.message || `patch:${res.status}` };
}
