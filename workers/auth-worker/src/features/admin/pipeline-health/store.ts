import {
  CRON_STALE_MS,
  HOT_USER_CAP,
  INCIDENT_RETENTION_MS,
  OPEN_INCIDENT_CAP,
  TIME_RANGE_MS,
  WATERMARK_WINDOW_MS,
  clipExcerpt,
  isIncidentStatus,
  isPipelineStage,
  type CronRunSummary,
  type DlqEntryDto,
  type DlqEntryStatus,
  type HotUserRow,
  type IncidentStatus,
  type PipelineIncident,
  type PipelineStage,
  type Severity,
  type TimeRangeId,
} from './domain.js';

const DDL = `
CREATE TABLE IF NOT EXISTS pipeline_cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  success INTEGER NOT NULL,
  total_pipelines INTEGER NOT NULL,
  successful INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_cron_finished ON pipeline_cron_runs (finished_at DESC);
CREATE TABLE IF NOT EXISTS pipeline_stage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  overall_status TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (captured_at)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_snap ON pipeline_stage_snapshots (captured_at DESC);
CREATE TABLE IF NOT EXISTS pipeline_incidents (
  fingerprint TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  code TEXT NOT NULL,
  table_name TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  count_1h INTEGER NOT NULL DEFAULT 0,
  count_24h INTEGER NOT NULL DEFAULT 0,
  count_total INTEGER NOT NULL DEFAULT 0,
  excerpt TEXT,
  runbook_id TEXT,
  related_worker_fingerprint TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipeline_inc_stage ON pipeline_incidents (stage, status, last_seen DESC);
CREATE TABLE IF NOT EXISTS pipeline_hot_users (
  user_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  pending_approx INTEGER,
  last_signal_at INTEGER NOT NULL,
  last_table TEXT
);
CREATE TABLE IF NOT EXISTS pipeline_health_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS pipeline_incident_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  status TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipeline_inc_notes ON pipeline_incident_notes (fingerprint, at DESC);
CREATE TABLE IF NOT EXISTS pipeline_dlq_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  user_id TEXT,
  table_name TEXT,
  queue_id INTEGER,
  pull_from_do INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER,
  body_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'logged',
  received_at INTEGER NOT NULL,
  replayed_at INTEGER,
  replayed_by TEXT,
  excerpt TEXT,
  UNIQUE (message_id, user_id, table_name, queue_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_dlq_received ON pipeline_dlq_entries (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_dlq_status ON pipeline_dlq_entries (status, received_at DESC);
CREATE TABLE IF NOT EXISTS pipeline_watermarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  user_id TEXT,
  records INTEGER NOT NULL DEFAULT 0,
  lag_ms INTEGER,
  source TEXT NOT NULL DEFAULT 'queue_insert'
);
CREATE INDEX IF NOT EXISTS idx_pipeline_wm_captured ON pipeline_watermarks (captured_at DESC);
`;

const SCHEMA_VERSION = 3;
let readySchemaVersion = 0;

export async function ensurePipelineTables(db: D1Database): Promise<void> {
  if (readySchemaVersion === SCHEMA_VERSION) return;
  const statements = DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  readySchemaVersion = SCHEMA_VERSION;
}

type IncidentRow = {
  fingerprint: string;
  stage: string;
  code: string;
  table_name: string | null;
  title: string;
  severity: string;
  status: string;
  first_seen: number;
  last_seen: number;
  count_1h: number;
  count_24h: number;
  count_total: number;
  excerpt: string | null;
  runbook_id: string | null;
  related_worker_fingerprint: string | null;
};

function toIncidentDto(row: IncidentRow, range: TimeRangeId): PipelineIncident {
  const countRange =
    range === '1h' ? row.count_1h : range === '24h' || range === '6h' ? row.count_24h : row.count_total;
  return {
    fingerprint: row.fingerprint,
    stage: isPipelineStage(row.stage) ? row.stage : 'queue',
    code: row.code,
    tableName: row.table_name,
    title: row.title,
    severity: (row.severity as Severity) ?? 'medium',
    status: isIncidentStatus(row.status) ? row.status : 'new',
    count1h: row.count_1h,
    count24h: row.count_24h,
    countRange,
    firstSeen: new Date(row.first_seen).toISOString(),
    lastSeen: new Date(row.last_seen).toISOString(),
    runbookId: row.runbook_id,
    excerpt: row.excerpt,
    relatedWorkerFingerprint: row.related_worker_fingerprint,
  };
}

export async function upsertPipelineIncident(
  db: D1Database,
  input: {
    fingerprint: string;
    stage: PipelineStage;
    code: string;
    tableName: string | null;
    title: string;
    severity: Severity;
    excerpt: string | null;
    runbookId: string | null;
    relatedWorkerFingerprint?: string | null;
    seenAt: number;
  },
): Promise<void> {
  await ensurePipelineTables(db);
  const now = input.seenAt;
  const existing = await db
    .prepare(`SELECT * FROM pipeline_incidents WHERE fingerprint = ?`)
    .bind(input.fingerprint)
    .first<IncidentRow>();

  const excerpt = input.excerpt ? clipExcerpt(input.excerpt) : null;

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO pipeline_incidents
        (fingerprint, stage, code, table_name, title, severity, status, first_seen, last_seen,
         count_1h, count_24h, count_total, excerpt, runbook_id, related_worker_fingerprint, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, 1, 1, 1, ?, ?, ?, ?)`,
      )
      .bind(
        input.fingerprint,
        input.stage,
        input.code,
        input.tableName,
        input.title,
        input.severity,
        now,
        now,
        excerpt,
        input.runbookId,
        input.relatedWorkerFingerprint ?? null,
        now,
      )
      .run();
  } else {
    let status = existing.status;
    // Phase 2: reopen resolved when the same fingerprint fires again. Ignored stays ignored.
    if (status === 'resolved') {
      status = 'new';
    }
    const hourAgo = now - TIME_RANGE_MS['1h'];
    const dayAgo = now - TIME_RANGE_MS['24h'];
    const next1h = existing.last_seen >= hourAgo ? existing.count_1h + 1 : 1;
    const next24h = existing.last_seen >= dayAgo ? existing.count_24h + 1 : 1;
    await db
      .prepare(
        `UPDATE pipeline_incidents SET
          stage = ?, code = ?, table_name = COALESCE(?, table_name), title = ?, severity = ?,
          status = ?, last_seen = ?, count_1h = ?, count_24h = ?, count_total = count_total + 1,
          excerpt = COALESCE(?, excerpt), runbook_id = COALESCE(?, runbook_id),
          related_worker_fingerprint = COALESCE(?, related_worker_fingerprint),
          updated_at = ?
        WHERE fingerprint = ?`,
      )
      .bind(
        input.stage,
        input.code,
        input.tableName,
        input.title,
        input.severity,
        status,
        now,
        next1h,
        next24h,
        excerpt,
        input.runbookId,
        input.relatedWorkerFingerprint ?? null,
        now,
        input.fingerprint,
      )
      .run();
  }
}

export async function recomputeIncidentWindowCounts(db: D1Database, now = Date.now()): Promise<void> {
  await ensurePipelineTables(db);
  const hourAgo = now - TIME_RANGE_MS['1h'];
  const dayAgo = now - TIME_RANGE_MS['24h'];
  await db
    .prepare(
      `UPDATE pipeline_incidents SET
        count_1h = CASE WHEN last_seen >= ? THEN MAX(count_1h, 1) ELSE 0 END,
        count_24h = CASE WHEN last_seen >= ? THEN MAX(count_24h, 1) ELSE 0 END`,
    )
    .bind(hourAgo, dayAgo)
    .run();
}

export async function pruneIncidents(db: D1Database, now = Date.now()): Promise<void> {
  await ensurePipelineTables(db);
  const cutoff = now - INCIDENT_RETENTION_MS;
  await db
    .prepare(
      `DELETE FROM pipeline_incidents
       WHERE status IN ('resolved', 'ignored') AND last_seen < ?`,
    )
    .bind(cutoff)
    .run();

  const open = await db
    .prepare(
      `SELECT fingerprint FROM pipeline_incidents
       WHERE status IN ('new', 'ack', 'investigating')
       ORDER BY last_seen ASC`,
    )
    .all<{ fingerprint: string }>();
  const rows = open.results ?? [];
  if (rows.length > OPEN_INCIDENT_CAP) {
    const drop = rows.slice(0, rows.length - OPEN_INCIDENT_CAP);
    for (const r of drop) {
      await db.prepare(`DELETE FROM pipeline_incidents WHERE fingerprint = ?`).bind(r.fingerprint).run();
    }
  }
}

export async function listIncidents(
  db: D1Database,
  opts: { range: TimeRangeId; stage?: string; status?: string; severity?: string },
): Promise<PipelineIncident[]> {
  await ensurePipelineTables(db);
  await recomputeIncidentWindowCounts(db);
  const rangeStart = Date.now() - TIME_RANGE_MS[opts.range];
  let sql = `SELECT * FROM pipeline_incidents WHERE last_seen >= ?`;
  const binds: unknown[] = [rangeStart];
  if (opts.stage) {
    sql += ` AND stage = ?`;
    binds.push(opts.stage);
  }
  if (opts.status) {
    sql += ` AND status = ?`;
    binds.push(opts.status);
  }
  if (opts.severity) {
    sql += ` AND severity = ?`;
    binds.push(opts.severity);
  }
  sql += ` ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    last_seen DESC
    LIMIT 200`;
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<IncidentRow>();
  return (res.results ?? []).map((r) => toIncidentDto(r, opts.range));
}

export async function getIncident(
  db: D1Database,
  fingerprint: string,
): Promise<{ incident: PipelineIncident; notes: Array<{ at: string; actor: string; status: string | null; note: string | null }> } | null> {
  await ensurePipelineTables(db);
  const row = await db
    .prepare(`SELECT * FROM pipeline_incidents WHERE fingerprint = ?`)
    .bind(fingerprint)
    .first<IncidentRow>();
  if (!row) return null;
  const notes = await db
    .prepare(`SELECT at, actor, status, note FROM pipeline_incident_notes WHERE fingerprint = ? ORDER BY at DESC LIMIT 20`)
    .bind(fingerprint)
    .all<{ at: number; actor: string; status: string | null; note: string | null }>();
  return {
    incident: toIncidentDto(row, '24h'),
    notes: (notes.results ?? []).map((n) => ({
      at: new Date(n.at).toISOString(),
      actor: n.actor,
      status: n.status,
      note: n.note,
    })),
  };
}

export async function patchIncident(
  db: D1Database,
  fingerprint: string,
  actor: string,
  patch: { status?: string; note?: string },
): Promise<PipelineIncident> {
  await ensurePipelineTables(db);
  const existing = await db
    .prepare(`SELECT * FROM pipeline_incidents WHERE fingerprint = ?`)
    .bind(fingerprint)
    .first<IncidentRow>();
  if (!existing) {
    const { PipelineHealthError } = await import('./domain.js');
    throw new PipelineHealthError('not_found', 'Incident not found', 404);
  }
  const status = patch.status && isIncidentStatus(patch.status) ? patch.status : existing.status;
  const now = Date.now();
  await db
    .prepare(`UPDATE pipeline_incidents SET status = ?, updated_at = ?, updated_by = ? WHERE fingerprint = ?`)
    .bind(status, now, actor, fingerprint)
    .run();
  if (patch.note || patch.status) {
    await db
      .prepare(`INSERT INTO pipeline_incident_notes (fingerprint, at, actor, status, note) VALUES (?, ?, ?, ?, ?)`)
      .bind(fingerprint, now, actor, patch.status ?? null, patch.note ?? null)
      .run();
  }
  await writeAudit(db, actor, 'status_patch', JSON.stringify({ fingerprint, status: patch.status, note: patch.note }));
  return toIncidentDto({ ...existing, status, updated_at: now } as IncidentRow & { updated_at: number }, '24h');
}

export async function countOpenAndNew1h(db: D1Database, now = Date.now()): Promise<{ openCount: number; new1h: number }> {
  await ensurePipelineTables(db);
  const hourAgo = now - TIME_RANGE_MS['1h'];
  const open = await db
    .prepare(
      `SELECT COUNT(*) as n FROM pipeline_incidents WHERE status IN ('new', 'ack', 'investigating')`,
    )
    .first<{ n: number }>();
  const neu = await db
    .prepare(
      `SELECT COUNT(*) as n FROM pipeline_incidents WHERE status = 'new' AND first_seen >= ?`,
    )
    .bind(hourAgo)
    .first<{ n: number }>();
  return { openCount: open?.n ?? 0, new1h: neu?.n ?? 0 };
}

export async function insertCronRun(
  db: D1Database,
  run: {
    startedAt: number;
    finishedAt: number;
    success: boolean;
    totalPipelines: number;
    successful: number;
    failed: number;
    payload: string;
  },
): Promise<void> {
  await ensurePipelineTables(db);
  await db
    .prepare(
      `INSERT INTO pipeline_cron_runs
       (started_at, finished_at, success, total_pipelines, successful, failed, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      run.startedAt,
      run.finishedAt,
      run.success ? 1 : 0,
      run.totalPipelines,
      run.successful,
      run.failed,
      run.payload,
    )
    .run();
  // retention 90 days
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  await db.prepare(`DELETE FROM pipeline_cron_runs WHERE finished_at < ?`).bind(cutoff).run();
}

export async function listCronRuns(db: D1Database, limit = 30): Promise<CronRunSummary[]> {
  await ensurePipelineTables(db);
  const res = await db
    .prepare(
      `SELECT id, started_at, finished_at, success, total_pipelines, successful, failed, payload
       FROM pipeline_cron_runs ORDER BY finished_at DESC LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 100))
    .all<{
      id: number;
      started_at: number;
      finished_at: number;
      success: number;
      total_pipelines: number;
      successful: number;
      failed: number;
      payload: string;
    }>();
  return (res.results ?? []).map((r) => {
    let results: CronRunSummary['results'];
    try {
      const parsed = JSON.parse(r.payload) as { results?: CronRunSummary['results'] };
      results = parsed.results;
    } catch {
      results = undefined;
    }
    return {
      id: r.id,
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: new Date(r.finished_at).toISOString(),
      success: r.success === 1,
      totalPipelines: r.total_pipelines,
      successful: r.successful,
      failed: r.failed,
      results,
    };
  });
}

export async function latestCronRun(db: D1Database): Promise<CronRunSummary | null> {
  const rows = await listCronRuns(db, 1);
  return rows[0] ?? null;
}

export async function upsertHotUser(
  db: D1Database,
  input: { userId: string; reason: string; pendingApprox?: number | null; lastTable?: string | null },
): Promise<void> {
  await ensurePipelineTables(db);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO pipeline_hot_users (user_id, reason, pending_approx, last_signal_at, last_table)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         reason = excluded.reason,
         pending_approx = COALESCE(excluded.pending_approx, pipeline_hot_users.pending_approx),
         last_signal_at = excluded.last_signal_at,
         last_table = COALESCE(excluded.last_table, pipeline_hot_users.last_table)`,
    )
    .bind(input.userId, input.reason, input.pendingApprox ?? null, now, input.lastTable ?? null)
    .run();

  const all = await db
    .prepare(`SELECT user_id FROM pipeline_hot_users ORDER BY last_signal_at ASC`)
    .all<{ user_id: string }>();
  const rows = all.results ?? [];
  if (rows.length > HOT_USER_CAP) {
    const drop = rows.slice(0, rows.length - HOT_USER_CAP);
    for (const r of drop) {
      await db.prepare(`DELETE FROM pipeline_hot_users WHERE user_id = ?`).bind(r.user_id).run();
    }
  }
}

export async function listHotUsers(db: D1Database, limit = 50): Promise<HotUserRow[]> {
  await ensurePipelineTables(db);
  const res = await db
    .prepare(
      `SELECT user_id, reason, pending_approx, last_signal_at, last_table
       FROM pipeline_hot_users ORDER BY last_signal_at DESC LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 200))
    .all<{
      user_id: string;
      reason: string;
      pending_approx: number | null;
      last_signal_at: number;
      last_table: string | null;
    }>();
  return (res.results ?? []).map((r) => ({
    userId: r.user_id,
    reason: r.reason,
    pendingApprox: r.pending_approx,
    lastSignalAt: new Date(r.last_signal_at).toISOString(),
    lastTable: r.last_table,
  }));
}

export async function saveStageSnapshot(db: D1Database, overall: string, payload: string): Promise<void> {
  await ensurePipelineTables(db);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO pipeline_stage_snapshots (captured_at, overall_status, payload) VALUES (?, ?, ?)
       ON CONFLICT(captured_at) DO UPDATE SET overall_status = excluded.overall_status, payload = excluded.payload`,
    )
    .bind(now, overall, payload)
    .run();
}

export async function writeAudit(db: D1Database, actor: string, action: string, detail?: string): Promise<void> {
  await ensurePipelineTables(db);
  await db
    .prepare(`INSERT INTO pipeline_health_audit (at, actor, action, detail) VALUES (?, ?, ?, ?)`)
    .bind(Date.now(), actor, action, detail ?? null)
    .run();
}

export function isCronStale(lastFinishedAtIso: string | null | undefined, now = Date.now()): boolean {
  if (!lastFinishedAtIso) return true;
  const t = Date.parse(lastFinishedAtIso);
  if (!Number.isFinite(t)) return true;
  return now - t > CRON_STALE_MS;
}

function toDlqStatus(raw: string | null | undefined): DlqEntryStatus {
  if (raw === 'replayed' || raw === 'discarded') return raw;
  return 'logged';
}

function dlqCanReplay(row: {
  status: string;
  user_id: string | null;
  table_name: string | null;
  queue_id: number | null;
}): boolean {
  return (
    toDlqStatus(row.status) === 'logged' &&
    !!row.user_id &&
    !!row.table_name &&
    row.queue_id != null &&
    Number.isFinite(row.queue_id)
  );
}

export async function listDlqEntries(
  db: D1Database,
  opts: { status?: string; limit?: number } = {},
): Promise<DlqEntryDto[]> {
  await ensurePipelineTables(db);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const status = opts.status?.trim();
  const res = status
    ? await db
        .prepare(
          `SELECT id, message_id, user_id, table_name, queue_id, pull_from_do, attempts, body_bytes,
                  status, received_at, replayed_at, replayed_by, excerpt
           FROM pipeline_dlq_entries WHERE status = ? ORDER BY received_at DESC LIMIT ?`,
        )
        .bind(status, limit)
        .all<{
          id: number;
          message_id: string;
          user_id: string | null;
          table_name: string | null;
          queue_id: number | null;
          pull_from_do: number;
          attempts: number | null;
          body_bytes: number | null;
          status: string;
          received_at: number;
          replayed_at: number | null;
          replayed_by: string | null;
          excerpt: string | null;
        }>()
    : await db
        .prepare(
          `SELECT id, message_id, user_id, table_name, queue_id, pull_from_do, attempts, body_bytes,
                  status, received_at, replayed_at, replayed_by, excerpt
           FROM pipeline_dlq_entries ORDER BY received_at DESC LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id: number;
          message_id: string;
          user_id: string | null;
          table_name: string | null;
          queue_id: number | null;
          pull_from_do: number;
          attempts: number | null;
          body_bytes: number | null;
          status: string;
          received_at: number;
          replayed_at: number | null;
          replayed_by: string | null;
          excerpt: string | null;
        }>();

  return (res.results ?? []).map((r) => ({
    id: r.id,
    messageId: r.message_id,
    userId: r.user_id,
    tableName: r.table_name,
    queueId: r.queue_id,
    pullFromDo: r.pull_from_do === 1,
    attempts: r.attempts,
    bodyBytes: r.body_bytes,
    status: toDlqStatus(r.status),
    receivedAt: new Date(r.received_at).toISOString(),
    replayedAt: r.replayed_at != null ? new Date(r.replayed_at).toISOString() : null,
    replayedBy: r.replayed_by,
    excerpt: r.excerpt,
    canReplay: dlqCanReplay(r),
  }));
}

export async function getDlqEntry(db: D1Database, id: number): Promise<DlqEntryDto | null> {
  await ensurePipelineTables(db);
  const r = await db
    .prepare(
      `SELECT id, message_id, user_id, table_name, queue_id, pull_from_do, attempts, body_bytes,
              status, received_at, replayed_at, replayed_by, excerpt
       FROM pipeline_dlq_entries WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: number;
      message_id: string;
      user_id: string | null;
      table_name: string | null;
      queue_id: number | null;
      pull_from_do: number;
      attempts: number | null;
      body_bytes: number | null;
      status: string;
      received_at: number;
      replayed_at: number | null;
      replayed_by: string | null;
      excerpt: string | null;
    }>();
  if (!r) return null;
  return {
    id: r.id,
    messageId: r.message_id,
    userId: r.user_id,
    tableName: r.table_name,
    queueId: r.queue_id,
    pullFromDo: r.pull_from_do === 1,
    attempts: r.attempts,
    bodyBytes: r.body_bytes,
    status: toDlqStatus(r.status),
    receivedAt: new Date(r.received_at).toISOString(),
    replayedAt: r.replayed_at != null ? new Date(r.replayed_at).toISOString() : null,
    replayedBy: r.replayed_by,
    excerpt: r.excerpt,
    canReplay: dlqCanReplay(r),
  };
}

export async function markDlqReplayed(db: D1Database, id: number, actor: string): Promise<void> {
  await ensurePipelineTables(db);
  await db
    .prepare(
      `UPDATE pipeline_dlq_entries SET status = 'replayed', replayed_at = ?, replayed_by = ? WHERE id = ?`,
    )
    .bind(Date.now(), actor, id)
    .run();
}

export async function countLoggedDlq(db: D1Database): Promise<number> {
  await ensurePipelineTables(db);
  const row = await db
    .prepare(`SELECT COUNT(*) as c FROM pipeline_dlq_entries WHERE status = 'logged'`)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function getWatermarkLagSummary(
  db: D1Database,
  windowMs = WATERMARK_WINDOW_MS,
): Promise<{ p50Minutes: number | null; sampleCount: number }> {
  await ensurePipelineTables(db);
  const since = Date.now() - windowMs;
  const res = await db
    .prepare(
      `SELECT lag_ms FROM pipeline_watermarks
       WHERE captured_at >= ? AND lag_ms IS NOT NULL
       ORDER BY lag_ms ASC LIMIT 500`,
    )
    .bind(since)
    .all<{ lag_ms: number }>();
  const lags = (res.results ?? []).map((r) => r.lag_ms).filter((n) => Number.isFinite(n) && n >= 0);
  if (lags.length === 0) return { p50Minutes: null, sampleCount: 0 };
  const mid = lags[Math.floor((lags.length - 1) / 2)]!;
  return { p50Minutes: Math.round(mid / 60_000), sampleCount: lags.length };
}

export type { IncidentStatus };
