import { CloudflareUsageError } from '../cloudflare-usage/domain.js';
import { readUsageToken } from '../cloudflare-usage/cloudflare-client.js';
import {
  DO_PROBE_TIMEOUT_MS,
  DO_SAMPLE_CAP,
  OVERVIEW_CACHE_KV_KEY,
  OVERVIEW_CACHE_TTL_SECONDS,
  PIPELINE_ARCHIVE_TABLES,
  QUEUE_CLEANUP_TABLES,
  REFRESH_AT_KV_KEY,
  REFRESH_MIN_INTERVAL_MS,
  SYNC_TABLE_NAMES,
  SYSTEM_CONFIG_KV_KEY,
  PipelineHealthError,
  isValidDoUserId,
  maxStageStatus,
  parseTimeRange,
  type CronRunSummary,
  type PipelineLag,
  type PipelineOverviewDto,
  type StageHealth,
  type StageStatus,
  type TableHealthRow,
  type TimeRangeId,
  type UserDoHealthDto,
} from './domain.js';
import { pollPipelineIncidents } from './incidents.js';
import { buildPipelineRecommendations } from './recommendations.js';
import { dispatchPipelineBurstAlert } from './alerts.js';
import { assertProbeBudget } from './actions.js';
import {
  countLoggedDlq,
  countOpenAndNew1h,
  ensurePipelineTables,
  getIncident,
  getWatermarkLagSummary,
  isCronStale,
  latestCronRun,
  listCronRuns,
  listDlqEntries,
  listHotUsers,
  listIncidents,
  patchIncident,
  saveStageSnapshot,
  writeAudit,
} from './store.js';
import { probeAuxBuckets } from './r2-aux.js';

function cacheKey(range: TimeRangeId): string {
  return `${OVERVIEW_CACHE_KV_KEY}:${range}`;
}

const inflightOverview = new Map<string, Promise<PipelineOverviewDto>>();

async function readRetentionDays(env: Env): Promise<number> {
  try {
    const raw = await env.SYSTEM_CONFIG_KV?.get(SYSTEM_CONFIG_KV_KEY);
    if (!raw) return 96;
    const parsed = JSON.parse(raw) as { d1tor2_cron?: { D1_RETENTION_DAYS?: number } };
    const n = parsed.d1tor2_cron?.D1_RETENTION_DAYS;
    return typeof n === 'number' && n > 0 ? Math.min(n, 365) : 96;
  } catch {
    return 96;
  }
}

async function fetchQueueApprox(
  env: Env,
): Promise<{ depth: number | null; dlq: number | null; error?: string }> {
  try {
    const token = await readUsageToken(env);
    const accountId = String((env as { ACCOUNT_ID?: string }).ACCOUNT_ID ?? '').trim();
    if (!accountId) return { depth: null, dlq: null, error: 'account_id_missing' };
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { depth: null, dlq: null, error: `queues_http_${res.status}` };
    const json = (await res.json()) as { result?: Array<Record<string, unknown>> };
    const rows = Array.isArray(json.result) ? json.result : [];
    let depth: number | null = null;
    let dlq: number | null = null;
    for (const row of rows) {
      const name = String(row.queue_name ?? row.name ?? '');
      const rawMsgs =
        (row as { messages?: unknown }).messages ??
        (row as { message_count?: unknown }).message_count ??
        (row as { producers_total_messages?: unknown }).producers_total_messages;
      const msgs = Number(rawMsgs);
      const n = Number.isFinite(msgs) ? msgs : null;
      if (name.includes('input-part-0') && n != null) depth = (depth ?? 0) + n;
      if (name.includes('error-queue-dlq') && n != null) dlq = (dlq ?? 0) + n;
    }
    return { depth, dlq };
  } catch (e) {
    if (e instanceof CloudflareUsageError) {
      return { depth: null, dlq: null, error: e.code };
    }
    return { depth: null, dlq: null, error: e instanceof Error ? e.message : 'queues_failed' };
  }
}

async function probeDoHealth(env: Env, userId: string): Promise<{
  pendingTotal: number;
  processedTotal: number;
  unhealthyTables: number;
  status: string;
} | null> {
  if (!env.USER_DO || !isValidDoUserId(userId)) return null;
  try {
    const stub = env.USER_DO.get(env.USER_DO.idFromString(userId));
    const res = await stub.fetch('https://do.internal/queue/health', {
      signal: AbortSignal.timeout(DO_PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      pendingTotal?: number;
      processedTotal?: number;
      unhealthyTables?: number;
      data?: {
        status?: string;
        pendingTotal?: number;
        processedTotal?: number;
        unhealthyTables?: number;
      };
    };
    const body = json.data ?? json;
    return {
      status: String(body.status ?? 'unknown'),
      pendingTotal: Number(body.pendingTotal ?? 0),
      processedTotal: Number(body.processedTotal ?? 0),
      unhealthyTables: Number(body.unhealthyTables ?? 0),
    };
  } catch {
    return null;
  }
}

async function pickSampleUserIds(env: Env): Promise<string[]> {
  if (!env.D1DB) return [];
  await ensurePipelineTables(env.D1DB);
  const hot = await listHotUsers(env.D1DB, DO_SAMPLE_CAP);
  const ids = new Set<string>(hot.map((h) => h.userId).filter(isValidDoUserId));

  if (ids.size < DO_SAMPLE_CAP) {
    try {
      const recent = await env.D1DB.prepare(
        `SELECT user_id as userId FROM users ORDER BY rowid DESC LIMIT ?`,
      )
        .bind(DO_SAMPLE_CAP)
        .all<{ userId: string }>();
      for (const r of recent.results ?? []) {
        if (isValidDoUserId(r.userId)) ids.add(r.userId);
        if (ids.size >= DO_SAMPLE_CAP) break;
      }
    } catch {
      /* users table may differ */
    }
  }

  return [...ids].slice(0, DO_SAMPLE_CAP);
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export async function getOverview(
  env: Env,
  range: TimeRangeId,
  opts?: { force?: boolean },
): Promise<PipelineOverviewDto> {
  const key = `${range}:${opts?.force ? 'force' : 'cache'}`;
  const existing = inflightOverview.get(key);
  if (existing) return existing;
  const pending = buildOverview(env, range, opts).finally(() => inflightOverview.delete(key));
  inflightOverview.set(key, pending);
  return pending;
}

async function buildOverview(env: Env, range: TimeRangeId, opts?: { force?: boolean }): Promise<PipelineOverviewDto> {
  if (!opts?.force) {
    try {
      const raw = await env.SYSTEM_CONFIG_KV?.get(cacheKey(range));
      if (raw) {
        const parsed = JSON.parse(raw) as PipelineOverviewDto;
        if (parsed?.stages?.length === 4) {
          return {
            ...parsed,
            stale: true,
            range,
            auxBuckets: parsed.auxBuckets ?? [],
            dlqLoggedApprox: parsed.dlqLoggedApprox ?? null,
            lag: {
              ...parsed.lag,
              watermarkSampleCount: parsed.lag?.watermarkSampleCount ?? null,
              e2eDoToD1Minutes: parsed.lag?.e2eDoToD1Minutes ?? null,
            },
          };
        }
      }
    } catch {
      /* rebuild */
    }
  }

  let telemetryError: string | undefined;
  let queuesError: string | undefined;

  try {
    await pollPipelineIncidents(env, range);
  } catch (e) {
    if (e instanceof PipelineHealthError) throw e;
    telemetryError = e instanceof Error ? e.message : 'poll_failed';
  }

  const retentionDays = await readRetentionDays(env);
  const lastCron = env.D1DB ? await latestCronRun(env.D1DB) : null;
  const counts = env.D1DB ? await countOpenAndNew1h(env.D1DB) : { openCount: 0, new1h: 0 };
  const incidents = env.D1DB ? await listIncidents(env.D1DB, { range }) : [];
  const hot = env.D1DB ? await listHotUsers(env.D1DB, 50) : [];

  const sampleIds = await pickSampleUserIds(env);
  const probes = await Promise.all(sampleIds.map((id) => probeDoHealth(env, id)));
  const okProbes = probes.filter(Boolean) as NonNullable<(typeof probes)[number]>[];
  const pendings = okProbes.map((p) => p.pendingTotal).sort((a, b) => a - b);
  const pendingSum = pendings.reduce((a, b) => a + b, 0);
  const unhealthySum = okProbes.reduce((a, b) => a + b.unhealthyTables, 0);
  const flushFails1h = incidents
    .filter((i) => i.stage === 'do' && (i.code === 'do.flush_failed' || i.code === 'do.flush_oversized'))
    .reduce((n, i) => n + i.count1h, 0);

  let doStatus: StageStatus = 'unknown';
  if (sampleIds.length === 0 && !telemetryError) doStatus = 'unknown';
  else if (unhealthySum > 0 || flushFails1h >= 3) doStatus = 'incident';
  else if (pendingSum > 200 || hot.length >= 3 || flushFails1h > 0) doStatus = 'watch';
  else if (okProbes.length > 0) doStatus = 'healthy';
  else doStatus = 'unavailable';

  const queueApprox = await fetchQueueApprox(env);
  queuesError = queueApprox.error;
  const chunk1h = incidents
    .filter((i) => i.code === 'queue.chunk_failed')
    .reduce((n, i) => n + i.count1h, 0);
  const dlqInc = incidents.filter((i) => i.code === 'queue.dlq').reduce((n, i) => n + i.count1h, 0);
  let queueStatus: StageStatus = 'unknown';
  if (queueApprox.error && queueApprox.depth == null && queueApprox.dlq == null && chunk1h === 0 && dlqInc === 0) {
    queueStatus = 'unavailable';
  } else if ((queueApprox.dlq ?? 0) > 0 || dlqInc > 0 || chunk1h >= 3) {
    queueStatus = 'incident';
  } else if (chunk1h > 0 || (queueApprox.depth ?? 0) > 500) {
    queueStatus = 'watch';
  } else {
    queueStatus = 'healthy';
  }

  const d1Inc = incidents.filter((i) => i.stage === 'd1');
  let d1Status: StageStatus = 'healthy';
  if (d1Inc.some((i) => i.severity === 'critical')) d1Status = 'incident';
  else if (d1Inc.length > 0) d1Status = 'watch';
  if (!env.D1DB) d1Status = 'unavailable';

  let r2Status: StageStatus = 'unknown';
  if (!lastCron) {
    r2Status = isCronStale(null) ? 'unavailable' : 'unknown';
  } else if (!lastCron.success || lastCron.failed > 0) {
    r2Status = 'incident';
  } else if (isCronStale(lastCron.finishedAt)) {
    r2Status = 'watch';
  } else {
    r2Status = 'healthy';
  }
  if (incidents.some((i) => i.stage === 'r2' && i.severity === 'critical' && i.count1h > 0)) {
    r2Status = 'incident';
  }

  const stages: StageHealth[] = [
    {
      stage: 'do',
      status: doStatus,
      summary: `Sample ${okProbes.length}/${sampleIds.length} DO · pendingΣ ${pendingSum} · unhealthyTables ${unhealthySum}`,
      metrics: {
        pendingSampleSum: pendingSum,
        unhealthyTables: unhealthySum,
        flushFails1h,
        hotUsers: hot.length,
        sampleOk: okProbes.length,
        sampleTried: sampleIds.length,
      },
      sampled: true,
    },
    {
      stage: 'queue',
      status: queueStatus,
      summary: `depth≈${queueApprox.depth ?? 'n/a'} · DLQ≈${queueApprox.dlq ?? 'n/a'} · chunk_failed 1h=${chunk1h}`,
      metrics: {
        queueDepthApprox: queueApprox.depth,
        dlqPendingApprox: queueApprox.dlq,
        chunkFailed1h: chunk1h,
        dlqEvents1h: dlqInc,
      },
    },
    {
      stage: 'd1',
      status: d1Status,
      summary: d1Inc.length ? `${d1Inc.length} open d1-stage incident(s)` : 'No D1-stage incidents in range',
      metrics: {
        incidentCount: d1Inc.length,
        retentionDays,
      },
    },
    {
      stage: 'r2',
      status: r2Status,
      summary: lastCron
        ? `Last cron ${lastCron.success ? 'OK' : 'FAIL'} ${lastCron.finishedAt} (${lastCron.successful}/${lastCron.totalPipelines})`
        : 'No cron run recorded yet',
      metrics: {
        lastCronSuccess: lastCron ? (lastCron.success ? 1 : 0) : null,
        lastCronFailed: lastCron?.failed ?? null,
        hoursSinceCron: lastCron
          ? Math.round((Date.now() - Date.parse(lastCron.finishedAt)) / 3_600_000)
          : null,
        retentionDays,
      },
    },
  ];

  const lagWm = env.D1DB ? await getWatermarkLagSummary(env.D1DB) : { p50Minutes: null, sampleCount: 0 };
  const dlqLoggedApprox = env.D1DB ? await countLoggedDlq(env.D1DB) : null;
  const auxBuckets = await probeAuxBuckets(env);

  const lag: PipelineLag = {
    doPendingP50: percentile(pendings, 50),
    doPendingP95: percentile(pendings, 95),
    doFlushedStuckOverMin: null,
    queueDepthApprox: queueApprox.depth,
    dlqPendingApprox: queueApprox.dlq ?? dlqLoggedApprox,
    e2eDoToD1Minutes: lagWm.p50Minutes,
    e2eD1ToR2Hours:
      lastCron && lastCron.success
        ? Math.round((Date.now() - Date.parse(lastCron.finishedAt)) / 3_600_000)
        : null,
    watermarkSampleCount: lagWm.sampleCount > 0 ? lagWm.sampleCount : null,
    confidence:
      lagWm.sampleCount >= 20 && okProbes.length >= 5 && lastCron
        ? 'high'
        : okProbes.length >= 5 && lastCron
          ? 'medium'
          : okProbes.length > 0 || lastCron || lagWm.sampleCount > 0
            ? 'low'
            : 'low',
  };

  const overall = maxStageStatus(stages.map((s) => s.status));
  const dto: PipelineOverviewDto = {
    cachedAt: new Date().toISOString(),
    stale: false,
    range,
    overall,
    stages,
    lag,
    openCount: counts.openCount,
    new1h: counts.new1h,
    retentionDays,
    lastCron,
    sampleSize: okProbes.length,
    auxBuckets,
    dlqLoggedApprox,
    telemetryError,
    queuesError,
  };

  try {
    await env.SYSTEM_CONFIG_KV?.put(cacheKey(range), JSON.stringify(dto), {
      expirationTtl: OVERVIEW_CACHE_TTL_SECONDS,
    });
  } catch {
    /* ignore */
  }
  if (env.D1DB) {
    try {
      await saveStageSnapshot(env.D1DB, overall, JSON.stringify({ stages: dto.stages, lag: dto.lag }));
    } catch {
      /* ignore */
    }
  }
  try {
    await dispatchPipelineBurstAlert(env, dto);
  } catch {
    /* alert best-effort */
  }
  return dto;
}

export async function refreshOverview(env: Env, actor: string, range: TimeRangeId): Promise<PipelineOverviewDto> {
  const lastRaw = await env.SYSTEM_CONFIG_KV?.get(REFRESH_AT_KV_KEY);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (Number.isFinite(last) && Date.now() - last < REFRESH_MIN_INTERVAL_MS) {
    throw new PipelineHealthError('rate_limited', 'Refresh is limited to once every 2 minutes', 429);
  }
  await env.SYSTEM_CONFIG_KV?.put(REFRESH_AT_KV_KEY, String(Date.now()));
  if (env.D1DB) await writeAudit(env.D1DB, actor, 'refresh', range);
  return getOverview(env, range, { force: true });
}

export async function listInbox(
  env: Env,
  query: { range?: string; stage?: string; status?: string; severity?: string },
) {
  const range = parseTimeRange(query.range);
  const overview = await getOverview(env, range);
  const incidents = env.D1DB
    ? await listIncidents(env.D1DB, {
        range,
        stage: query.stage,
        status: query.status,
        severity: query.severity,
      })
    : [];
  return { incidents, cachedAt: overview.cachedAt, range, telemetryError: overview.telemetryError };
}

export async function incidentDetail(env: Env, fingerprint: string) {
  if (!env.D1DB) throw new PipelineHealthError('not_found', 'Incident not found', 404);
  const row = await getIncident(env.D1DB, fingerprint);
  if (!row) throw new PipelineHealthError('not_found', 'Incident not found', 404);
  return row;
}

export async function updateIncident(
  env: Env,
  fingerprint: string,
  actor: string,
  patch: { status?: string; note?: string },
) {
  if (!env.D1DB) throw new PipelineHealthError('not_found', 'Incident not found', 404);
  return patchIncident(env.D1DB, fingerprint, actor, patch);
}

export async function listRecommendations(env: Env, range: TimeRangeId) {
  const overview = await getOverview(env, range);
  const incidents = env.D1DB ? await listIncidents(env.D1DB, { range }) : [];
  return {
    recommendations: buildPipelineRecommendations(incidents, overview),
    cachedAt: overview.cachedAt,
  };
}

export async function getTables(env: Env): Promise<{ tables: TableHealthRow[]; cachedAt: string }> {
  const overview = await getOverview(env, '24h');
  const lastCron = overview.lastCron;
  const byTable = new Map<string, { success: boolean; at: string; error?: string }>();
  if (lastCron?.results) {
    for (const r of lastCron.results) {
      byTable.set(r.tableName, {
        success: r.success,
        at: lastCron.finishedAt,
        error: r.error,
      });
    }
  }
  const incidents = env.D1DB ? await listIncidents(env.D1DB, { range: '24h' }) : [];
  const cleanup = new Set<string>(QUEUE_CLEANUP_TABLES);
  const archive = new Set<string>(PIPELINE_ARCHIVE_TABLES);
  const tables: TableHealthRow[] = SYNC_TABLE_NAMES.map((table) => {
    const cron = byTable.get(table);
    return {
      table,
      sync: true,
      archive: archive.has(table),
      cleanup: cleanup.has(table),
      incidentCount: incidents.filter((i) => i.tableName === table).length,
      lastCronSuccess: cron ? cron.success : archive.has(table) ? null : null,
      lastCronAt: cron?.at ?? null,
      lastCronError: cron?.error ?? null,
    };
  });
  // also show archive-only tables not in SYNC (order_items etc.)
  for (const table of PIPELINE_ARCHIVE_TABLES) {
    if (SYNC_TABLE_NAMES.includes(table as (typeof SYNC_TABLE_NAMES)[number])) continue;
    const cron = byTable.get(table);
    tables.push({
      table,
      sync: false,
      archive: true,
      cleanup: false,
      incidentCount: incidents.filter((i) => i.tableName === table).length,
      lastCronSuccess: cron ? cron.success : null,
      lastCronAt: cron?.at ?? null,
      lastCronError: cron?.error ?? null,
    });
  }
  return { tables, cachedAt: overview.cachedAt };
}

export async function getCronRuns(env: Env, limit = 30): Promise<{ runs: CronRunSummary[] }> {
  if (!env.D1DB) return { runs: [] };
  return { runs: await listCronRuns(env.D1DB, limit) };
}

export async function getHotUsers(env: Env) {
  if (!env.D1DB) return { users: [] as Awaited<ReturnType<typeof listHotUsers>> };
  return { users: await listHotUsers(env.D1DB, 100) };
}

export async function probeUser(env: Env, userId: string, actor?: string): Promise<UserDoHealthDto> {
  if (!isValidDoUserId(userId)) {
    throw new PipelineHealthError('invalid_user_id', 'userId must be a 64-char Durable Object id', 400);
  }
  if (actor) {
    await assertProbeBudget(env, actor);
  }
  if (!env.USER_DO) {
    throw new PipelineHealthError('do_probe_failed', 'USER_DO binding missing', 503);
  }
  const stub = env.USER_DO.get(env.USER_DO.idFromString(userId));
  let healthJson: Record<string, unknown> = {};
  let statsJson: Record<string, unknown> | null = null;
  try {
    const healthRes = await stub.fetch('https://do.internal/queue/health', {
      signal: AbortSignal.timeout(DO_PROBE_TIMEOUT_MS),
    });
    healthJson = (await healthRes.json()) as Record<string, unknown>;
  } catch (e) {
    throw new PipelineHealthError(
      'do_probe_failed',
      e instanceof Error ? e.message : 'DO health probe failed',
      503,
    );
  }
  try {
    const statsRes = await stub.fetch('https://do.internal/queue/stats', {
      signal: AbortSignal.timeout(DO_PROBE_TIMEOUT_MS),
    });
    if (statsRes.ok) statsJson = (await statsRes.json()) as Record<string, unknown>;
  } catch {
    statsJson = null;
  }

  const body = (healthJson.data ?? healthJson) as Record<string, unknown>;
  const statsBody = (statsJson?.data ?? statsJson) as Record<string, unknown> | null;
  const tables: UserDoHealthDto['tables'] = [];
  if (statsBody && typeof statsBody === 'object') {
    for (const [name, raw] of Object.entries(statsBody)) {
      if (!raw || typeof raw !== 'object' || name === 'success') continue;
      const row = raw as Record<string, unknown>;
      if (!('pending' in row) && !('flushed' in row)) continue;
      const pendingObj = row.pending as { count?: number } | number | undefined;
      const flushedObj = row.flushed as { count?: number } | number | undefined;
      const processedObj = row.processed as { count?: number } | number | undefined;
      tables.push({
        table: name,
        pending: typeof pendingObj === 'number' ? pendingObj : Number(pendingObj?.count ?? 0),
        flushed: typeof flushedObj === 'number' ? flushedObj : Number(flushedObj?.count ?? 0),
        processed: typeof processedObj === 'number' ? processedObj : Number(processedObj?.count ?? 0),
      });
    }
  }

  return {
    userId,
    status: String(body.status ?? 'unknown'),
    pendingTotal: Number(body.pendingTotal ?? 0),
    processedTotal: Number(body.processedTotal ?? 0),
    unhealthyTables: Number(body.unhealthyTables ?? 0),
    tables: tables.length ? tables : undefined,
  };
}

export async function dailyPipelineHealthSync(env: Env): Promise<void> {
  try {
    await pollPipelineIncidents(env, '1h');
    await getOverview(env, '1h', { force: true });
  } catch {
    /* scheduled must not throw past other jobs */
  }
}

export async function getDlqInbox(env: Env, query: { status?: string; limit?: number }) {
  if (!env.D1DB) return { entries: [], loggedApprox: 0 };
  const entries = await listDlqEntries(env.D1DB, {
    status: query.status,
    limit: query.limit,
  });
  const loggedApprox = await countLoggedDlq(env.D1DB);
  return { entries, loggedApprox };
}

export async function getAuxBucketHealth(env: Env) {
  const buckets = await probeAuxBuckets(env);
  return { buckets };
}
