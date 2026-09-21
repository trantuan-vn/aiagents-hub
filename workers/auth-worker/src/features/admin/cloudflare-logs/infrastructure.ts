import { HUB_WRANGLER_FACTS } from '../cloudflare-usage/inventory.js';
import {
  CloudflareLogsError,
  OVERVIEW_CACHE_KV_KEY,
  OVERVIEW_CACHE_TTL_SECONDS,
  POLL_EVENT_LIMIT,
  REFRESH_AT_KV_KEY,
  REFRESH_MIN_INTERVAL_MS,
  healthStatus,
  parseTimeRange,
  type ErrorGroup,
  type LogsOverviewDto,
  type TimeRangeId,
} from './domain.js';
import { countOpenAndNew1h, ensureLogTables, getGroup, listGroups, patchGroup, upsertErrorEvents } from './groups.js';
import { buildStabilityRecommendations } from './recommendations.js';
import { fetchSamplingDigest, fetchWorkerHealth, queryTelemetryEvents, toLogEventDto } from './telemetry-client.js';

function cacheKey(range: TimeRangeId): string {
  return `${OVERVIEW_CACHE_KV_KEY}:${range}`;
}

const inflightOverview = new Map<string, Promise<LogsOverviewDto>>();

export async function pollErrorIndex(env: Env, range: TimeRangeId = '1h'): Promise<number> {
  if (!env.D1DB) return 0;
  await ensureLogTables(env.D1DB);
  const { events, error } = await queryTelemetryEvents(env, {
    range,
    errorsOnly: true,
    limit: POLL_EVENT_LIMIT,
    view: 'events',
  });
  if (error && events.length === 0) throw new Error(error);
  return upsertErrorEvents(env.D1DB, events);
}

export async function getOverview(env: Env, range: TimeRangeId, opts?: { force?: boolean }): Promise<LogsOverviewDto> {
  const key = `${range}:${opts?.force ? 'force' : 'cache'}`;
  const existing = inflightOverview.get(key);
  if (existing) return existing;
  const pending = buildOverview(env, range, opts).finally(() => inflightOverview.delete(key));
  inflightOverview.set(key, pending);
  return pending;
}

async function buildOverview(env: Env, range: TimeRangeId, opts?: { force?: boolean }): Promise<LogsOverviewDto> {
  if (!opts?.force) {
    try {
      const raw = await env.SYSTEM_CONFIG_KV?.get(cacheKey(range));
      if (raw) {
        const parsed = JSON.parse(raw) as LogsOverviewDto;
        if (parsed?.workers?.length && parsed.workers.some((w) => w.observabilityErrors != null || w.observabilityEvents != null)) {
          return { ...parsed, stale: true, range };
        }
      }
    } catch {
      /* rebuild */
    }
  }

  let telemetryError: string | undefined;
  let graphqlError: string | undefined;
  try {
    await pollErrorIndex(env, range);
  } catch (e) {
    if (e instanceof CloudflareLogsError) throw e;
    telemetryError = e instanceof Error ? e.message : 'poll_failed';
  }

  const health = await fetchWorkerHealth(env, range).catch((e) => {
    if (e instanceof CloudflareLogsError) throw e;
    graphqlError = e instanceof Error ? e.message : 'graphql_failed';
    return {
      workers: HUB_WRANGLER_FACTS.workerNames.map((scriptName) => ({
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
        status: 'unavailable' as const,
        sampled: false,
      })),
    };
  });
  graphqlError = graphqlError ?? health.error;

  const sampling = await fetchSamplingDigest(env).catch(() =>
    HUB_WRANGLER_FACTS.workerNames.map((scriptName) => ({
      scriptName,
      enabled: true,
      headSamplingRate: 1,
      sampled: false,
    })),
  );
  const sampledScripts = new Set(sampling.filter((s) => s.sampled).map((s) => s.scriptName));
  const groups = env.D1DB ? await listGroups(env.D1DB, { range, sampledScripts: [...sampledScripts] }) : [];
  const criticalOpen = new Set(
    groups.filter((g) => g.severity === 'critical' && (g.status === 'new' || g.status === 'ack')).map((g) => g.scriptName),
  );
  const workers = health.workers.map((w) => ({
    ...w,
    sampled: sampledScripts.has(w.scriptName),
    status: w.status === 'unavailable' ? w.status : healthStatus(w.errorRatePct, criticalOpen.has(w.scriptName)),
  }));
  const counts = env.D1DB ? await countOpenAndNew1h(env.D1DB) : { openCount: 0, new1h: 0 };
  const dto: LogsOverviewDto = {
    cachedAt: new Date().toISOString(),
    stale: false,
    range,
    workers,
    openCount: counts.openCount,
    new1h: counts.new1h,
    sampling,
    telemetryError,
    graphqlError,
  };
  try {
    await env.SYSTEM_CONFIG_KV?.put(cacheKey(range), JSON.stringify(dto), { expirationTtl: OVERVIEW_CACHE_TTL_SECONDS });
  } catch {
    /* ignore */
  }
  return dto;
}

export async function refreshOverview(env: Env, actor: string, range: TimeRangeId): Promise<LogsOverviewDto> {
  const lastRaw = await env.SYSTEM_CONFIG_KV?.get(REFRESH_AT_KV_KEY);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (Number.isFinite(last) && Date.now() - last < REFRESH_MIN_INTERVAL_MS) {
    throw new CloudflareLogsError('rate_limited', 'Refresh is limited to once every 2 minutes', 429);
  }
  await env.SYSTEM_CONFIG_KV?.put(REFRESH_AT_KV_KEY, String(Date.now()));
  void actor;
  return getOverview(env, range, { force: true });
}

export async function listInbox(env: Env, query: { range?: string; script?: string; status?: string; severity?: string }) {
  const range = parseTimeRange(query.range);
  const overview = await getOverview(env, range);
  const sampled = overview.sampling.filter((s) => s.sampled).map((s) => s.scriptName);
  const groups = env.D1DB
    ? await listGroups(env.D1DB, {
        range,
        script: query.script,
        status: query.status,
        severity: query.severity,
        sampledScripts: sampled,
      })
    : [];
  return { groups, cachedAt: overview.cachedAt, range, telemetryError: overview.telemetryError };
}

export async function groupDetail(env: Env, fingerprint: string) {
  if (!env.D1DB) throw new CloudflareLogsError('not_found', 'Error group not found', 404);
  const sampling = await fetchSamplingDigest(env).catch(() => []);
  const sampled = sampling.filter((s) => s.sampled).map((s) => s.scriptName);
  const row = await getGroup(env.D1DB, fingerprint, sampled);
  if (!row) throw new CloudflareLogsError('not_found', 'Error group not found', 404);
  const runbook = row.group.runbookId;
  return { ...row, runbookId: runbook };
}

export async function updateGroup(env: Env, fingerprint: string, actor: string, patch: { status?: string; note?: string }) {
  if (!env.D1DB) throw new CloudflareLogsError('not_found', 'Error group not found', 404);
  return patchGroup(env.D1DB, fingerprint, actor, patch);
}

export async function listRecommendations(env: Env, range: TimeRangeId) {
  const overview = await getOverview(env, range);
  const sampled = overview.sampling.filter((s) => s.sampled).map((s) => s.scriptName);
  const groups: ErrorGroup[] = env.D1DB ? await listGroups(env.D1DB, { range, sampledScripts: sampled }) : [];
  return { recommendations: buildStabilityRecommendations(groups, overview.workers), cachedAt: overview.cachedAt };
}

export async function liveEvents(
  env: Env,
  opts: { range: TimeRangeId; script?: string; includeWarn?: boolean; cursor?: string; invocationId?: string },
) {
  const { events, nextCursor, error } = await queryTelemetryEvents(env, {
    range: opts.range,
    script: opts.script,
    cursor: opts.cursor,
    includeWarn: opts.includeWarn,
    errorsOnly: !opts.includeWarn,
    invocationId: opts.invocationId,
    view: opts.invocationId ? 'invocations' : 'events',
  });
  return { events: events.map(toLogEventDto), nextCursor, error, live: true as const };
}

export async function dailyLogsSync(env: Env): Promise<void> {
  try {
    await pollErrorIndex(env, '1h');
  } catch {
    /* scheduled job must not throw past usage sync */
  }
}
