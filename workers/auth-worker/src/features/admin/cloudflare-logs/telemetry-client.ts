import { HUB_WRANGLER_FACTS } from '../cloudflare-usage/inventory.js';
import { readUsageToken, getWorkerObservability } from '../cloudflare-usage/cloudflare-client.js';
import {
  CF_API_SLOW_TIMEOUT_MS,
  CF_API_TIMEOUT_MS,
  CloudflareLogsError,
  CRASH_OUTCOMES,
  LIVE_EVENT_LIMIT,
  LIVE_EVENT_MAX,
  TIME_RANGE_MS,
  type LogEventDto,
  type LogLevel,
  type ParsedLogEvent,
  type SamplingDigest,
  type TimeRangeId,
  type WorkerHealth,
  canonicalScriptName,
  clipExcerpt,
  healthStatus,
  scriptsForTelemetryFilter,
} from './domain.js';
import { inferHandlerKind } from './fingerprint.js';
import { redactRecord } from './redact.js';

const CF_API = 'https://api.cloudflare.com/client/v4';
const DATASET = 'cloudflare-workers';

type Json = Record<string, unknown>;

type TelemetryFilter =
  | {
      id?: string;
      key: string;
      operation: string;
      type: string;
      value?: string | number;
    }
  | {
      kind: 'group';
      filterCombination: 'AND' | 'OR';
      filters: TelemetryFilter[];
    };

async function cfPost(
  token: string,
  path: string,
  body: unknown,
  timeoutMs = CF_API_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; json: Json }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json: Json = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      json = {};
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function asObj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(obj: Json, paths: string[]): unknown {
  for (const path of paths) {
    const parts = path.split('.');
    let cur: unknown = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') {
        ok = false;
        break;
      }
      cur = (cur as Json)[part];
    }
    if (ok && cur != null && cur !== '') return cur;
  }
  return undefined;
}

function metadataErrorFilter(): TelemetryFilter {
  return { key: '$metadata.error', operation: 'exists', type: 'string' };
}

function errorFilters(): TelemetryFilter {
  return {
    kind: 'group',
    filterCombination: 'OR',
    filters: [
      metadataErrorFilter(),
      { key: '$workers.outcome', operation: 'in', type: 'string', value: CRASH_OUTCOMES.join(',') },
      { key: '$workers.event.response.status', operation: 'gte', type: 'number', value: 500 },
      { key: 'level', operation: 'eq', type: 'string', value: 'error' },
    ],
  };
}

function hubScriptFilter(script?: string): TelemetryFilter {
  const names = scriptsForTelemetryFilter(script, HUB_WRANGLER_FACTS.workerNames).join(',');
  return {
    kind: 'group',
    filterCombination: 'OR',
    filters: [
      { key: '$workers.scriptName', operation: 'in', type: 'string', value: names },
      { key: '$metadata.service', operation: 'in', type: 'string', value: names },
    ],
  };
}

export function timeframeFor(range: TimeRangeId, now = Date.now()): { from: number; to: number } {
  return { from: now - TIME_RANGE_MS[range], to: now };
}

function parseLevel(raw: unknown): LogLevel {
  const s = str(raw).toLowerCase();
  if (s === 'debug' || s === 'info' || s === 'warn' || s === 'error') return s;
  if (s === 'log') return 'info';
  return 'unknown';
}

function tryJson(text: string): Json | null {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(t);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

function stackTop(stack: unknown): string | null {
  const s = str(stack);
  if (!s) return null;
  const line = s.split('\n').map((l) => l.trim()).find((l) => l && !l.includes('workerd') && !l.includes('workers-sdk'));
  return line ?? s.split('\n')[0] ?? null;
}

function unwrapEvent(raw: unknown): Json {
  const row = asObj(raw);
  const source = asObj(row.source);
  if (row.$metadata || row.$workers || row.message) return row;
  if (source.$metadata || source.$workers || source.message) return { ...source, ...row };
  return row;
}

function invocationMessagePath(message: unknown): string | null {
  const m = str(message);
  const match = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i.exec(m);
  return match?.[2] ?? null;
}

export function parseTelemetryEvent(raw: unknown, index = 0): ParsedLogEvent | null {
  const row = unwrapEvent(raw);
  const meta = asObj(row.$metadata ?? row.metadata);
  const workers = asObj(row.$workers ?? row.workers);
  const workersEvent = asObj(workers.event);
  const request = asObj(workersEvent.request ?? pick(row, ['$workers.event.request']));
  const response = asObj(workersEvent.response ?? pick(row, ['$workers.event.response']));

  let structured: Json = {};
  const messageRaw = pick(row, ['message', '$workers.message', 'log']) ?? row.message;
  if (typeof messageRaw === 'string') {
    structured = tryJson(messageRaw) ?? {};
  } else if (messageRaw && typeof messageRaw === 'object' && !Array.isArray(messageRaw)) {
    structured = messageRaw as Json;
  }

  const merged: Json = { ...row, ...structured };
  const rawScript = str(
    pick(merged, ['$workers.scriptName', 'scriptName', '$metadata.service']) ??
      workers.scriptName ??
      meta.service ??
      structured.service,
  );
  if (!rawScript) return null;
  const scriptName = canonicalScriptName(rawScript);

  const tsRaw = pick(merged, ['timestamp', '$metadata.timestamp', 'ts', 'time']) ?? meta.timestamp;
  let tsMs = Date.now();
  if (typeof tsRaw === 'number') tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
  else if (typeof tsRaw === 'string') {
    const parsed = Date.parse(tsRaw);
    if (Number.isFinite(parsed)) tsMs = parsed;
  }

  const outcome = str(pick(merged, ['$workers.outcome', 'outcome']) ?? workers.outcome) || null;
  const httpStatus = num(pick(merged, ['$workers.event.response.status', 'status']) ?? response.status);
  const path =
    str(pick(merged, ['$workers.event.request.path', 'path']) ?? request.path ?? request.url) ||
    invocationMessagePath(messageRaw) ||
    null;
  const queue = str(pick(merged, ['$workers.event.queue', 'queue']) ?? workersEvent.queue) || null;
  const type = str(meta.type ?? pick(merged, ['$cloudflare.$metadata.type', '$metadata.type']));
  const eventName = str(structured.event ?? merged.event) || null;
  const metaError = str(meta.error);
  const errorName = str(structured.errorName ?? merged.errorName) || (metaError ? 'Error' : null);
  const errorMessage = str(structured.errorMessage ?? merged.errorMessage) || metaError || null;
  let level = parseLevel(structured.level ?? merged.level ?? meta.level);
  if (
    level !== 'warn' &&
    (metaError ||
      (httpStatus != null && httpStatus >= 500) ||
      (outcome != null && outcome !== 'ok' && outcome !== 'canceled'))
  ) {
    level = 'error';
  }
  const invocationId = str(meta.id ?? meta.requestId ?? merged.invocationId ?? workersEvent.requestId) || null;
  const id = invocationId || str(meta.id) || `ev-${tsMs}-${index}`;
  const message =
    clipExcerpt(
      str(structured.event ? `${structured.event} ${errorMessage || structured.errorMessage || ''}` : messageRaw) ||
        errorMessage ||
        eventName ||
        outcome ||
        'event',
      200,
    ) || 'event';

  const payload = redactRecord(merged);
  const rpcHint = /userdo|rpc/i.test(str(messageRaw) + type + path);
  return {
    id,
    tsMs,
    scriptName,
    level,
    outcome,
    httpStatus,
    event: eventName,
    errorName,
    errorMessage,
    stackTop: stackTop(structured.stack ?? merged.stack ?? metaError),
    pathOrQueue: queue || path,
    handlerKind: inferHandlerKind({
      path,
      queue,
      type: rpcHint ? `${type} rpc` : type,
      cron: type.includes('cron') || str(workersEvent.cron).length > 0,
    }),
    invocationId,
    component: str(structured.component) || (rawScript !== scriptName ? rawScript : null),
    message,
    payload,
  };
}

export function toLogEventDto(event: ParsedLogEvent): LogEventDto {
  return {
    id: event.id,
    ts: new Date(event.tsMs).toISOString(),
    scriptName: event.scriptName,
    level: event.level,
    outcome: event.outcome,
    httpStatus: event.httpStatus,
    event: event.event,
    message: event.message,
    invocationId: event.invocationId,
    payload: event.payload,
  };
}

function telemetryEvents(json: Json): unknown[] {
  const result = asObj(json.result);
  const eventsWrap = asObj(result.events);
  const list = asArr(eventsWrap.events);
  if (list.length) return list;
  const invocations = asObj(result.invocations);
  const flat: unknown[] = [];
  for (const value of Object.values(invocations)) {
    if (Array.isArray(value)) flat.push(...value);
  }
  return flat;
}

function calculationCountsByScript(json: Json): Map<string, number> {
  const result = asObj(json.result);
  const out = new Map<string, number>();
  for (const calc of asArr(result.calculations)) {
    for (const agg of asArr(asObj(calc).aggregates)) {
      const a = asObj(agg);
      const groups = asArr(a.groups);
      let script = '';
      for (const g of groups) {
        const row = asObj(g);
        const key = str(row.key);
        const value = str(row.value);
        if (!value) continue;
        if (key.includes('scriptName') || key.includes('service') || !script) script = value;
      }
      const n = num(a.value) ?? num(a.count) ?? 0;
      if (!script) continue;
      const canon = canonicalScriptName(script);
      out.set(canon, (out.get(canon) ?? 0) + n);
    }
  }
  return out;
}

async function queryCountByScript(
  token: string,
  accountId: string,
  timeframe: { from: number; to: number },
  extraFilters: TelemetryFilter[],
): Promise<{ counts: Map<string, number>; error?: string }> {
  const body: Json = {
    queryId: extraFilters.length ? 'hub-obs-error-count' : 'hub-obs-event-count',
    timeframe,
    view: 'calculations',
    ignoreSeries: true,
    parameters: {
      datasets: [DATASET],
      filterCombination: 'AND',
      filters: [hubScriptFilter(), ...extraFilters],
      calculations: [{ operator: 'count', alias: 'events' }],
      groupBys: [{ type: 'string', value: '$workers.scriptName' }],
    },
  };
  const res = await cfPost(
    token,
    `/accounts/${accountId}/workers/observability/telemetry/query`,
    body,
    CF_API_SLOW_TIMEOUT_MS,
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CloudflareLogsError('observability_unreadable', 'Workers Observability token cannot query logs', 503);
    }
    return { counts: new Map(), error: `telemetry_http_${res.status}` };
  }
  return { counts: calculationCountsByScript(res.json) };
}

export async function queryObservabilityCounts(
  env: Env,
  range: TimeRangeId,
): Promise<{ errors: Map<string, number>; events: Map<string, number>; error?: string }> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const timeframe = timeframeFor(range);
  const [errRes, allRes] = await Promise.all([
    queryCountByScript(token, accountId, timeframe, [metadataErrorFilter()]),
    queryCountByScript(token, accountId, timeframe, []),
  ]);
  return {
    errors: errRes.counts,
    events: allRes.counts,
    error: errRes.error ?? allRes.error,
  };
}

export async function queryTelemetryEvents(
  env: Env,
  opts: {
    range: TimeRangeId;
    view?: 'events' | 'invocations';
    script?: string;
    errorsOnly?: boolean;
    limit?: number;
    cursor?: string;
    invocationId?: string;
    includeWarn?: boolean;
    timeframe?: { from: number; to: number };
  },
): Promise<{ events: ParsedLogEvent[]; nextCursor: string | null; error?: string }> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const limit = Math.min(Math.max(opts.limit ?? LIVE_EVENT_LIMIT, 1), LIVE_EVENT_MAX);
  const timeframe = opts.timeframe ?? timeframeFor(opts.range);
  const filters: TelemetryFilter[] = [hubScriptFilter(opts.script)];
  if (opts.errorsOnly !== false && !opts.includeWarn) filters.push(errorFilters());
  if (opts.invocationId) {
    filters.push({ key: '$metadata.id', operation: 'eq', type: 'string', value: opts.invocationId });
  }
  const body: Json = {
    queryId: opts.invocationId ? 'hub-invocation' : opts.errorsOnly === false ? 'hub-explorer' : 'hub-error-inbox',
    timeframe,
    limit,
    view: opts.view ?? 'events',
    parameters: {
      datasets: [DATASET],
      filterCombination: 'AND',
      filters,
    },
  };
  if (opts.cursor) body.offset = opts.cursor;

  const slow = opts.range === '7d' || opts.range === '24h';
  const res = await cfPost(
    token,
    `/accounts/${accountId}/workers/observability/telemetry/query`,
    body,
    slow ? CF_API_SLOW_TIMEOUT_MS : CF_API_TIMEOUT_MS,
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CloudflareLogsError('observability_unreadable', 'Workers Observability token cannot query logs', 503);
    }
    return { events: [], nextCursor: null, error: `telemetry_http_${res.status}` };
  }
  const rawEvents = telemetryEvents(res.json);
  const events = rawEvents.map((row, i) => parseTelemetryEvent(row, i)).filter((e): e is ParsedLogEvent => Boolean(e));
  const lastId = events.length ? events[events.length - 1]?.id : null;
  return { events, nextCursor: events.length >= limit ? lastId : null };
}

export async function fetchWorkerHealth(
  env: Env,
  range: TimeRangeId = '24h',
  now = new Date(),
): Promise<{ workers: WorkerHealth[]; error?: string }> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - TIME_RANGE_MS[range]).toISOString().slice(0, 10);
  const richQuery = `
    query ($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { requests errors cpuTimeUs }
            quantiles { cpuTimeP50 cpuTimeP99 }
            dimensions { scriptName datetimeHour }
          }
        }
      }
    }`;
  const basicQuery = `
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

  const run = async (query: string) =>
    cfPost(token, '/graphql', { query, variables: { accountTag: accountId, start, end } });

  const [gqlRich, obs] = await Promise.all([
    run(richQuery),
    queryObservabilityCounts(env, range).catch((e) => {
      if (e instanceof CloudflareLogsError) throw e;
      return {
        errors: new Map<string, number>(),
        events: new Map<string, number>(),
        error: e instanceof Error ? e.message : 'obs_count_failed',
      };
    }),
  ]);
  let res = gqlRich;
  if (res.ok && asArr(res.json.errors).length) res = await run(basicQuery);
  const graphqlError =
    !res.ok || asArr(res.json.errors).length
      ? !res.ok
        ? `graphql_http_${res.status}`
        : str(asObj(asArr(res.json.errors)[0]).message) || 'graphql_error'
      : undefined;

  type Acc = {
    requests: number;
    errors: number;
    cpuP50: number[];
    cpuP99: number[];
    hours: Map<string, number>;
    outcomes: WorkerHealth['outcomes'];
  };
  const byScript = new Map<string, Acc>();
  for (const name of HUB_WRANGLER_FACTS.workerNames) {
    byScript.set(name, { requests: 0, errors: 0, cpuP50: [], cpuP99: [], hours: new Map(), outcomes: {} });
  }
  if (!graphqlError) {
    const accounts = asArr(asObj(asObj(res.json.data).viewer).accounts);
    const groups = asArr(asObj(accounts[0]).workersInvocationsAdaptive);
    for (const raw of groups) {
      const g = asObj(raw);
      const dim = asObj(g.dimensions);
      const script = canonicalScriptName(str(dim.scriptName));
      const acc = byScript.get(script);
      if (!acc) continue;
      const sum = asObj(g.sum);
      const q = asObj(g.quantiles);
      acc.requests += num(sum.requests) ?? 0;
      acc.errors += num(sum.errors) ?? 0;
      const p50 = num(q.cpuTimeP50);
      const p99 = num(q.cpuTimeP99);
      if (p50 != null) acc.cpuP50.push(p50);
      if (p99 != null) acc.cpuP99.push(p99);
      const hour = str(dim.datetimeHour);
      if (hour) acc.hours.set(hour, (acc.hours.get(hour) ?? 0) + (num(sum.errors) ?? 0));
    }
  }

  const workers: WorkerHealth[] = HUB_WRANGLER_FACTS.workerNames.map((scriptName) => {
    const acc = byScript.get(scriptName)!;
    const observabilityErrors = obs.errors.get(scriptName) ?? 0;
    const observabilityEvents = obs.events.get(scriptName) ?? 0;
    const hasObs = !obs.error;
    const errorRatePct = hasObs
      ? observabilityEvents > 0
        ? (observabilityErrors / observabilityEvents) * 100
        : observabilityErrors > 0
          ? 100
          : 0
      : acc.requests > 0
        ? (acc.errors / acc.requests) * 100
        : acc.errors > 0
          ? 100
          : null;
    const sparkline = [...acc.hours.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-24);
    return {
      scriptName,
      requests: hasObs ? observabilityEvents : acc.requests,
      graphqlErrors: acc.errors,
      observabilityErrors: hasObs ? observabilityErrors : null,
      observabilityEvents: hasObs ? observabilityEvents : null,
      errorRatePct,
      http5xx: null,
      outcomes: acc.outcomes,
      cpuMsP50: avg(acc.cpuP50),
      cpuMsP99: avg(acc.cpuP99),
      sparkline,
      status: graphqlError && obs.error ? 'unavailable' : healthStatus(errorRatePct, false),
      sampled: false,
    };
  });
  return { workers, error: [obs.error, graphqlError].filter(Boolean).join('; ') || undefined };
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function emptyHealth(scriptName: string, status: WorkerHealth['status']): WorkerHealth {
  return {
    scriptName,
    requests: 0,
    graphqlErrors: 0,
    observabilityErrors: null,
    observabilityEvents: null,
    errorRatePct: null,
    http5xx: null,
    outcomes: {},
    cpuMsP50: null,
    cpuMsP99: null,
    sparkline: [],
    status,
    sampled: false,
  };
}

export async function fetchSamplingDigest(env: Env): Promise<SamplingDigest[]> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const safe = new Set<string>(HUB_WRANGLER_FACTS.samplingSafeWorkerNames);
  const rows: SamplingDigest[] = [];
  for (const scriptName of HUB_WRANGLER_FACTS.workerNames) {
    const obs = await getWorkerObservability(token, accountId, scriptName);
    const rate = obs.headSamplingRate;
    const sampled = Boolean(safe.has(scriptName) && rate != null && rate < 1);
    rows.push({
      scriptName,
      enabled: obs.enabled,
      headSamplingRate: rate,
      sampled,
    });
  }
  return rows;
}
