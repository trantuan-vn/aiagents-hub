import {
  CloudflareLogsError,
  GROUP_RETENTION_MS,
  OPEN_GROUP_CAP,
  clipExcerpt,
  isGroupStatus,
  isPersistableError,
  matchRunbook,
  severityForEvent,
  type ErrorGroup,
  type GroupNote,
  type GroupStatus,
  type ParsedLogEvent,
  type TimeRangeId,
  TIME_RANGE_MS,
} from './domain.js';
import { fingerprintSha12 } from './fingerprint.js';

const DDL = `
CREATE TABLE IF NOT EXISTS worker_error_groups (
  fingerprint TEXT PRIMARY KEY,
  script_name TEXT NOT NULL,
  component TEXT,
  event TEXT,
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
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_worker_err_last ON worker_error_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_worker_err_status ON worker_error_groups (status, last_seen DESC);
CREATE TABLE IF NOT EXISTS worker_error_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  status TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_worker_err_notes ON worker_error_notes (fingerprint, at DESC);
`;

let tablesReady = false;

export async function ensureLogTables(db: D1Database): Promise<void> {
  if (tablesReady) return;
  const statements = DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  tablesReady = true;
}

type GroupRow = {
  fingerprint: string;
  script_name: string;
  component: string | null;
  event: string | null;
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
  updated_at: number;
  updated_by: string | null;
};

function toDto(row: GroupRow, range: TimeRangeId, sampledScripts: Set<string>): ErrorGroup {
  const countRange = range === '1h' ? row.count_1h : range === '24h' || range === '6h' ? row.count_24h : row.count_total;
  return {
    fingerprint: row.fingerprint,
    title: row.title,
    scriptName: row.script_name,
    component: row.component,
    event: row.event,
    severity: (row.severity as ErrorGroup['severity']) ?? 'medium',
    status: isGroupStatus(row.status) ? row.status : 'new',
    count1h: row.count_1h,
    count24h: row.count_24h,
    countRange,
    firstSeen: new Date(row.first_seen).toISOString(),
    lastSeen: new Date(row.last_seen).toISOString(),
    source: 'hub_index',
    runbookId: row.runbook_id,
    excerpt: row.excerpt,
    sampled: sampledScripts.has(row.script_name),
  };
}

export async function upsertErrorEvents(
  db: D1Database,
  events: ParsedLogEvent[],
  now = Date.now(),
): Promise<number> {
  await ensureLogTables(db);
  let written = 0;
  const hourAgo = now - TIME_RANGE_MS['1h'];
  const dayAgo = now - TIME_RANGE_MS['24h'];

  for (const event of events) {
    if (!isPersistableError(event)) continue;
    const fingerprint = await fingerprintSha12(event);
    const existing = await db
      .prepare(`SELECT * FROM worker_error_groups WHERE fingerprint = ?`)
      .bind(fingerprint)
      .first<GroupRow>();
    const runbook = matchRunbook(event);
    const severity = severityForEvent(event);
    if (severity === 'low') continue;
    const title = event.event || event.errorName || event.message || event.outcome || 'error';
    const excerpt = clipExcerpt(event.message || event.errorMessage || title);
    const prevStatus = existing?.status;
    let status: GroupStatus = existing && isGroupStatus(existing.status) ? existing.status : 'new';
    if (status === 'resolved' && existing && now - existing.updated_at < TIME_RANGE_MS['1h']) {
      status = 'new';
    }
    const firstSeen = existing?.first_seen ?? event.tsMs;
    const lastSeen = Math.max(existing?.last_seen ?? 0, event.tsMs);
    const countTotal = (existing?.count_total ?? 0) + 1;
    const count1h = (existing && existing.last_seen >= hourAgo ? existing.count_1h : 0) + (event.tsMs >= hourAgo ? 1 : 0);
    const count24h = (existing && existing.last_seen >= dayAgo ? existing.count_24h : 0) + (event.tsMs >= dayAgo ? 1 : 0);

    await db
      .prepare(
        `INSERT INTO worker_error_groups (
          fingerprint, script_name, component, event, title, severity, status,
          first_seen, last_seen, count_1h, count_24h, count_total, excerpt, runbook_id, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          component = excluded.component,
          event = excluded.event,
          title = excluded.title,
          severity = excluded.severity,
          status = excluded.status,
          last_seen = excluded.last_seen,
          count_1h = excluded.count_1h,
          count_24h = excluded.count_24h,
          count_total = excluded.count_total,
          excerpt = excluded.excerpt,
          runbook_id = excluded.runbook_id,
          updated_at = excluded.updated_at`,
      )
      .bind(
        fingerprint,
        event.scriptName,
        event.component,
        event.event,
        title,
        severity,
        status,
        firstSeen,
        lastSeen,
        count1h,
        count24h,
        countTotal,
        excerpt,
        runbook?.id ?? existing?.runbook_id ?? null,
        now,
        existing?.updated_by ?? null,
      )
      .run();
    if (status === 'new' && prevStatus === 'resolved') {
      await addNote(db, fingerprint, 'system', 'new', 'Reopened: error still occurring');
    }
    written += 1;
  }

  await db.prepare(`DELETE FROM worker_error_groups WHERE status IN ('resolved', 'ignored') AND last_seen < ?`).bind(now - GROUP_RETENTION_MS).run();
  const open = await db
    .prepare(`SELECT COUNT(*) as n FROM worker_error_groups WHERE status IN ('new', 'ack', 'investigating')`)
    .first<{ n: number }>();
  const extra = (open?.n ?? 0) - OPEN_GROUP_CAP;
  if (extra > 0) {
    await db
      .prepare(
        `DELETE FROM worker_error_groups WHERE fingerprint IN (
          SELECT fingerprint FROM worker_error_groups
          WHERE status = 'new'
          ORDER BY last_seen ASC
          LIMIT ?
        )`,
      )
      .bind(extra)
      .run();
  }
  return written;
}

export async function listGroups(
  db: D1Database,
  opts: { range: TimeRangeId; script?: string; status?: string; severity?: string; sampledScripts?: string[] },
): Promise<ErrorGroup[]> {
  await ensureLogTables(db);
  const sampled = new Set(opts.sampledScripts ?? []);
  let sql = `SELECT * FROM worker_error_groups WHERE last_seen >= ?`;
  const binds: unknown[] = [Date.now() - TIME_RANGE_MS[opts.range === '6h' ? '24h' : opts.range]];
  if (opts.script) {
    sql += ` AND script_name = ?`;
    binds.push(opts.script);
  }
  if (opts.status && isGroupStatus(opts.status)) {
    sql += ` AND status = ?`;
    binds.push(opts.status);
  }
  if (opts.severity) {
    sql += ` AND severity = ?`;
    binds.push(opts.severity);
  }
  sql += ` ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, last_seen DESC LIMIT 200`;
  const res = await db.prepare(sql).bind(...binds).all<GroupRow>();
  return (res.results ?? []).map((row) => toDto(row, opts.range, sampled));
}

export async function getGroup(
  db: D1Database,
  fingerprint: string,
  sampledScripts: string[] = [],
): Promise<{ group: ErrorGroup; notes: GroupNote[] } | null> {
  await ensureLogTables(db);
  const row = await db.prepare(`SELECT * FROM worker_error_groups WHERE fingerprint = ?`).bind(fingerprint).first<GroupRow>();
  if (!row) return null;
  const notesRes = await db
    .prepare(`SELECT at, actor, status, note FROM worker_error_notes WHERE fingerprint = ? ORDER BY at DESC LIMIT 50`)
    .bind(fingerprint)
    .all<{ at: number; actor: string; status: string | null; note: string | null }>();
  return {
    group: toDto(row, '24h', new Set(sampledScripts)),
    notes: (notesRes.results ?? []).map((n) => ({
      at: new Date(n.at).toISOString(),
      actor: n.actor,
      status: n.status && isGroupStatus(n.status) ? n.status : null,
      note: n.note,
    })),
  };
}

export async function patchGroup(
  db: D1Database,
  fingerprint: string,
  actor: string,
  patch: { status?: string; note?: string },
): Promise<{ group: ErrorGroup; notes: GroupNote[] }> {
  await ensureLogTables(db);
  const current = await getGroup(db, fingerprint);
  if (!current) {
    throw new CloudflareLogsError('not_found', 'Error group not found', 404);
  }
  if (patch.status && !isGroupStatus(patch.status)) {
    throw new CloudflareLogsError('invalid_status', 'Invalid group status', 400);
  }
  const nextStatus = patch.status && isGroupStatus(patch.status) ? patch.status : current.group.status;
  await db
    .prepare(`UPDATE worker_error_groups SET status = ?, updated_at = ?, updated_by = ? WHERE fingerprint = ?`)
    .bind(nextStatus, Date.now(), actor, fingerprint)
    .run();
  if (patch.note?.trim() || patch.status) {
    await addNote(db, fingerprint, actor, nextStatus, patch.note?.trim() ?? null);
  }
  const updated = await getGroup(db, fingerprint);
  return updated!;
}

async function addNote(db: D1Database, fingerprint: string, actor: string, status: string | null, note: string | null): Promise<void> {
  await db
    .prepare(`INSERT INTO worker_error_notes (fingerprint, at, actor, status, note) VALUES (?, ?, ?, ?, ?)`)
    .bind(fingerprint, Date.now(), actor, status, note)
    .run();
}

export async function countOpenAndNew1h(db: D1Database, now = Date.now()): Promise<{ openCount: number; new1h: number }> {
  await ensureLogTables(db);
  const open = await db
    .prepare(`SELECT COUNT(*) as n FROM worker_error_groups WHERE status IN ('new', 'ack', 'investigating')`)
    .first<{ n: number }>();
  const fresh = await db
    .prepare(`SELECT COUNT(*) as n FROM worker_error_groups WHERE status = 'new' AND last_seen >= ?`)
    .bind(now - TIME_RANGE_MS['1h'])
    .first<{ n: number }>();
  return { openCount: open?.n ?? 0, new1h: fresh?.n ?? 0 };
}
