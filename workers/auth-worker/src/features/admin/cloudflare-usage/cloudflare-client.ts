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

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  const res = await cfFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  const errors = asArray<unknown>(res.body.errors);
  if (errors.length) return null;
  return (res.body.data as T) ?? null;
}

type GqlGroup = {
  sum?: Record<string, unknown>;
  uniq?: Record<string, unknown>;
  quantiles?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
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

async function fetchGraphQlUsage(
  token: string,
  accountId: string,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
  errors: string[],
): Promise<Record<string, RawMetricUsage>> {
  const usage: Record<string, RawMetricUsage> = {};
  const start = gqlDate(periodStart);
  const end = gqlDate(now < periodEnd ? now : periodEnd);
  const today = gqlDate(now);

  const workersQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests errors cpuTimeMs }
            dimensions { scriptName }
          }
        }
      }
    }`;

  const workers = await graphql<{ viewer?: { accounts?: Array<{ workersInvocationsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    workersQuery,
    { accountTag: accountId, start, end },
  );
  if (!workers) errors.push('graphql:workers');
  else {
    const groups = workers.viewer?.accounts?.[0]?.workersInvocationsAdaptiveGroups ?? [];
    for (const g of groups) {
      const name = str(g.dimensions?.scriptName) || 'unknown';
      addUsage(usage, 'workers.requests', num(g.sum?.requests), { key: name, label: name, usage: num(g.sum?.requests), unit: 'request' });
      addUsage(usage, 'workers.cpu_ms', num(g.sum?.cpuTimeMs), { key: name, label: name, usage: num(g.sum?.cpuTimeMs), unit: 'cpu_ms' });
    }
  }

  const d1Query = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { rowsRead rowsWritten queryCount }
            dimensions { databaseId }
          }
        }
      }
    }`;
  const d1 = await graphql<{ viewer?: { accounts?: Array<{ d1AnalyticsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    d1Query,
    { accountTag: accountId, start, end },
  );
  if (!d1) errors.push('graphql:d1');
  else {
    for (const g of d1.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? []) {
      const id = str(g.dimensions?.databaseId) || 'd1';
      addUsage(usage, 'd1.rows_read', num(g.sum?.rowsRead), { key: id, label: id, usage: num(g.sum?.rowsRead), unit: 'row' });
      addUsage(usage, 'd1.rows_written', num(g.sum?.rowsWritten), { key: id, label: id, usage: num(g.sum?.rowsWritten), unit: 'row' });
    }
  }

  const kvQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests }
            dimensions { actionType }
          }
        }
      }
    }`;
  const kv = await graphql<{ viewer?: { accounts?: Array<{ kvOperationsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    kvQuery,
    { accountTag: accountId, start, end },
  );
  if (!kv) errors.push('graphql:kv');
  else {
    for (const g of kv.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? []) {
      const action = str(g.dimensions?.actionType).toLowerCase();
      const n = num(g.sum?.requests);
      if (action.includes('read') || action === 'get') addUsage(usage, 'kv.reads', n);
      else if (action.includes('write') || action === 'put') addUsage(usage, 'kv.writes', n);
      else if (action.includes('delete')) addUsage(usage, 'kv.deletes', n);
      else if (action.includes('list')) addUsage(usage, 'kv.lists', n);
    }
  }

  const r2Query = `
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
  const r2 = await graphql<{ viewer?: { accounts?: Array<{ r2OperationsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    r2Query,
    { accountTag: accountId, start, end },
  );
  if (!r2) errors.push('graphql:r2');
  else {
    for (const g of r2.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? []) {
      const action = str(g.dimensions?.actionType).toLowerCase();
      const bucket = str(g.dimensions?.bucketName) || 'r2';
      const n = num(g.sum?.requests);
      const classA = action.includes('put') || action.includes('list') || action.includes('copy') || action.includes('create');
      const metric = classA ? 'r2.class_a' : 'r2.class_b';
      addUsage(usage, metric, n, { key: bucket, label: bucket, usage: n, unit: 'request' });
    }
  }

  const doQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests duration }
            dimensions { namespaceName }
          }
        }
      }
    }`;
  const durable = await graphql<{ viewer?: { accounts?: Array<{ durableObjectsInvocationsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    doQuery,
    { accountTag: accountId, start, end },
  );
  if (!durable) errors.push('graphql:do');
  else {
    for (const g of durable.viewer?.accounts?.[0]?.durableObjectsInvocationsAdaptiveGroups ?? []) {
      const ns = str(g.dimensions?.namespaceName) || 'do';
      addUsage(usage, 'do.requests', num(g.sum?.requests), { key: ns, label: ns, usage: num(g.sum?.requests), unit: 'request' });
      addUsage(usage, 'do.duration_gb_s', num(g.sum?.duration), { key: ns, label: ns, usage: num(g.sum?.duration), unit: 'GB-s' });
    }
  }

  const todayWorkers = await graphql<{ viewer?: { accounts?: Array<{ workersInvocationsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    workersQuery,
    { accountTag: accountId, start: today, end: today },
  );
  if (todayWorkers) {
    let todayReq = 0;
    let todayCpu = 0;
    for (const g of todayWorkers.viewer?.accounts?.[0]?.workersInvocationsAdaptiveGroups ?? []) {
      todayReq += num(g.sum?.requests);
      todayCpu += num(g.sum?.cpuTimeMs);
    }
    if (usage['workers.requests']) usage['workers.requests'].today = todayReq;
    if (usage['workers.cpu_ms']) usage['workers.cpu_ms'].today = todayCpu;
  }

  const todayD1 = await graphql<{ viewer?: { accounts?: Array<{ d1AnalyticsAdaptiveGroups?: GqlGroup[] }> } }>(
    token,
    d1Query,
    { accountTag: accountId, start: today, end: today },
  );
  if (todayD1) {
    let read = 0;
    let written = 0;
    for (const g of todayD1.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? []) {
      read += num(g.sum?.rowsRead);
      written += num(g.sum?.rowsWritten);
    }
    if (usage['d1.rows_read']) usage['d1.rows_read'].today = read;
    if (usage['d1.rows_written']) usage['d1.rows_written'].today = written;
  }

  return usage;
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

  const [inventory, usage, billable] = await Promise.all([
    fetchInventory(token, accountId, partialErrors),
    fetchGraphQlUsage(token, accountId, periodStart, periodEnd, now, partialErrors),
    fetchBillableUsage(token, accountId, periodStart, now, partialErrors),
  ]);

  return { plans, inventory, usage, billable, partialErrors };
}
