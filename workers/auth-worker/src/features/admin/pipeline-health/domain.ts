export const OVERVIEW_CACHE_TTL_SECONDS = 60;
export const REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const FORCE_FLUSH_MIN_INTERVAL_MS = 5 * 60 * 1000;
export const RERUN_ALL_MIN_INTERVAL_MS = 10 * 60 * 1000;
export const RERUN_TABLE_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const DLQ_REPLAY_MIN_INTERVAL_MS = 30 * 1000;
export const DLQ_REPLAY_DAILY_CAP = 10;
export const DO_PROBE_WINDOW_MS = 5 * 60 * 1000;
export const DO_PROBE_MAX_PER_WINDOW = 30;
export const EXCERPT_MAX_CHARS = 512;
export const OPEN_INCIDENT_CAP = 500;
export const HOT_USER_CAP = 200;
export const DO_SAMPLE_CAP = 20;
export const DO_PROBE_TIMEOUT_MS = 2_000;
export const POLL_EVENT_LIMIT = 200;
export const INCIDENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const CRON_STALE_MS = 36 * 60 * 60 * 1000;
export const WATERMARK_WINDOW_MS = 6 * 60 * 60 * 1000;
export const OVERVIEW_CACHE_KV_KEY = 'pipeline-health-overview';
export const REFRESH_AT_KV_KEY = 'pipeline-health-refresh-at';
export const FORCE_FLUSH_KV_PREFIX = 'pipeline-health-force-flush:';
export const RERUN_KV_PREFIX = 'pipeline-health-rerun:';
export const PROBE_COUNT_KV_PREFIX = 'pipeline-health-probe:';
export const DLQ_REPLAY_KV_PREFIX = 'pipeline-health-dlq-replay:';
export const ALERTS_SENT_KV_KEY = 'pipeline-health-alerts-sent';
export const SYSTEM_CONFIG_KV_KEY = 'aiagents-hub-system-config';
export const INTERNAL_TRIGGER_HEADER = 'X-Hub-Admin-Action';
export const INTERNAL_TRIGGER_VALUE = 'pipeline-health';

export type PipelineHealthErrorCode =
  | 'token_missing'
  | 'observability_unreadable'
  | 'rate_limited'
  | 'invalid_status'
  | 'invalid_user_id'
  | 'invalid_table'
  | 'confirm_required'
  | 'binding_missing'
  | 'not_found'
  | 'do_probe_failed'
  | 'action_failed'
  | 'replay_not_possible';

export class PipelineHealthError extends Error {
  readonly code: PipelineHealthErrorCode;
  readonly status: 400 | 403 | 404 | 429 | 503;

  constructor(code: PipelineHealthErrorCode, message: string, status: 400 | 403 | 404 | 429 | 503) {
    super(message);
    this.name = 'PipelineHealthError';
    this.code = code;
    this.status = status;
  }
}

export type TimeRangeId = '1h' | '6h' | '24h' | '7d';
export type PipelineStage = 'do' | 'queue' | 'd1' | 'r2';
export type StageStatus = 'healthy' | 'watch' | 'incident' | 'unknown' | 'unavailable';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'new' | 'ack' | 'investigating' | 'resolved' | 'ignored';

export const TIME_RANGE_MS: Record<TimeRangeId, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Tables queue-worker accepts — keep in sync with workers/queue-worker/src/index.ts */
export const QUEUE_CLEANUP_TABLES = [
  'service_usages',
  'orders',
  'payments',
  'refunds',
  'commissions',
  'workflow_royalties',
  'workflow_user_stars',
  'workflow_comments',
] as const;

export const SYNC_TABLE_NAMES = [
  ...QUEUE_CLEANUP_TABLES,
  'services',
  'vouchers',
  'versions',
  'users',
  'sessions',
  'connections',
  'subscriptions',
  'api_tokens',
  'pending_messages',
  'user_mfa',
  'user_ekyc',
  'user_did',
  'passkey_credentials',
  'backup_codes',
  'commission_policies',
  'agent_workflows',
  'payout_beneficiary',
  'earnings_payouts',
] as const;

/** Tables archived by d1tor2 PIPELINE_CONFIGS */
export const PIPELINE_ARCHIVE_TABLES = [
  'service_usages',
  'orders',
  'order_items',
  'order_discounts',
  'payments',
  'refunds',
] as const;

export const PIPELINE_EVENT_PREFIXES = [
  'do.flush_',
  'do.flush_failed',
  'do.flush_record_oversized',
  'queue.',
  'cron.pipeline',
  'cron.failed',
] as const;

export type StageHealth = {
  stage: PipelineStage;
  status: StageStatus;
  summary: string;
  metrics: Record<string, number | string | null>;
  sampled?: boolean;
};

export type PipelineLag = {
  doPendingP50: number | null;
  doPendingP95: number | null;
  doFlushedStuckOverMin: number | null;
  queueDepthApprox: number | null;
  dlqPendingApprox: number | null;
  e2eDoToD1Minutes: number | null;
  e2eD1ToR2Hours: number | null;
  watermarkSampleCount: number | null;
  confidence: 'low' | 'medium' | 'high';
};

export type DlqEntryStatus = 'logged' | 'replayed' | 'discarded';

export type DlqEntryDto = {
  id: number;
  messageId: string;
  userId: string | null;
  tableName: string | null;
  queueId: number | null;
  pullFromDo: boolean;
  attempts: number | null;
  bodyBytes: number | null;
  status: DlqEntryStatus;
  receivedAt: string;
  replayedAt: string | null;
  replayedBy: string | null;
  excerpt: string | null;
  canReplay: boolean;
};

export type AuxBucketHealth = {
  id: 'ekyc' | 'version_backup';
  binding: string;
  status: 'healthy' | 'watch' | 'unavailable' | 'unknown';
  summary: string;
  objectCountHint: number | null;
  checkedAt: string;
};

export type PipelineIncident = {
  fingerprint: string;
  stage: PipelineStage;
  code: string;
  tableName: string | null;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  count1h: number;
  count24h: number;
  countRange: number;
  firstSeen: string;
  lastSeen: string;
  runbookId: string | null;
  excerpt: string | null;
  relatedWorkerFingerprint: string | null;
};

export type UserDoHealthDto = {
  userId: string;
  status: string;
  pendingTotal: number;
  processedTotal: number;
  unhealthyTables: number;
  tables?: Array<{ table: string; pending: number; flushed: number; processed: number }>;
};

export type CronRunSummary = {
  id: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  totalPipelines: number;
  successful: number;
  failed: number;
  results?: Array<{
    pipelineName: string;
    tableName: string;
    success: boolean;
    recordsProcessed: number;
    error?: string;
  }>;
};

export type HotUserRow = {
  userId: string;
  reason: string;
  pendingApprox: number | null;
  lastSignalAt: string;
  lastTable: string | null;
};

export type TableHealthRow = {
  table: string;
  sync: boolean;
  archive: boolean;
  cleanup: boolean;
  incidentCount: number;
  lastCronSuccess: boolean | null;
  lastCronAt: string | null;
  lastCronError: string | null;
};

export type PipelineRecommendation = {
  id: string;
  fingerprint?: string;
  title: string;
  because: string;
  actions: string[];
  files: string[];
  effort: 'S' | 'M' | 'L';
  severity: Severity;
  status: 'advisory';
  priorityScore: number;
};

export type PipelineOverviewDto = {
  cachedAt: string;
  stale: boolean;
  range: TimeRangeId;
  overall: StageStatus;
  stages: StageHealth[];
  lag: PipelineLag;
  openCount: number;
  new1h: number;
  retentionDays: number;
  lastCron: CronRunSummary | null;
  sampleSize: number;
  auxBuckets: AuxBucketHealth[];
  dlqLoggedApprox: number | null;
  telemetryError?: string;
  queuesError?: string;
};

export type PipelineRunbook = {
  id: string;
  title: string;
  checks: string[];
  files: string[];
  severityHint: Severity;
  match: (code: string, stage: PipelineStage, table: string | null) => boolean;
};

export function parseTimeRange(raw: string | undefined | null): TimeRangeId {
  if (raw === '6h' || raw === '24h' || raw === '7d' || raw === '1h') return raw;
  return '1h';
}

export function isIncidentStatus(value: string): value is IncidentStatus {
  return value === 'new' || value === 'ack' || value === 'investigating' || value === 'resolved' || value === 'ignored';
}

export function isPipelineStage(value: string): value is PipelineStage {
  return value === 'do' || value === 'queue' || value === 'd1' || value === 'r2';
}

export function clipExcerpt(text: string, max = EXCERPT_MAX_CHARS): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function maxStageStatus(statuses: StageStatus[]): StageStatus {
  const rank: Record<StageStatus, number> = {
    healthy: 0,
    watch: 1,
    unknown: 2,
    unavailable: 3,
    incident: 4,
  };
  let best: StageStatus = 'healthy';
  for (const s of statuses) {
    if (rank[s] > rank[best]) best = s;
  }
  return best;
}

/** Map structured logger event → pipeline incident code + stage */
export function classifyPipelineEvent(event: string | null | undefined, message = ''): {
  code: string;
  stage: PipelineStage;
  severity: Severity;
} | null {
  const ev = (event ?? '').toLowerCase();
  const hay = `${ev} ${message}`.toLowerCase();

  if (ev.includes('cron.pipeline_failed') || hay.includes('cron.pipeline_failed')) {
    return { code: 'cron.pipeline_failed', stage: 'r2', severity: 'critical' };
  }
  if (ev === 'cron.failed' || hay.includes('cron.failed')) {
    return { code: 'cron.failed', stage: 'r2', severity: 'critical' };
  }
  if (ev.includes('queue.dlq') || hay.includes('queue.dlq') || hay.includes('error-queue-dlq')) {
    return { code: 'queue.dlq', stage: 'queue', severity: 'critical' };
  }
  if (ev.includes('queue.chunk_failed')) {
    return { code: 'queue.chunk_failed', stage: 'queue', severity: 'critical' };
  }
  if (ev.includes('queue.pull_from_do_failed')) {
    return { code: 'queue.pull_from_do_failed', stage: 'queue', severity: 'high' };
  }
  if (ev.includes('queue.parse_unknown_table')) {
    return { code: 'queue.unknown_table', stage: 'queue', severity: 'high' };
  }
  if (ev.includes('queue.parse_')) {
    return { code: 'queue.parse_invalid', stage: 'queue', severity: 'medium' };
  }
  if (ev.includes('queue.cleanup')) {
    return { code: 'queue.cleanup_failed', stage: 'd1', severity: 'high' };
  }
  if (ev.includes('do.flush_record_oversized') || hay.includes('oversized')) {
    return { code: 'do.flush_oversized', stage: 'do', severity: 'medium' };
  }
  if (ev.includes('do.flush_failed')) {
    return { code: 'do.flush_failed', stage: 'do', severity: 'high' };
  }
  if (ev.startsWith('do.flush_') || ev.startsWith('queue.') || ev.startsWith('cron.')) {
    const stage: PipelineStage = ev.startsWith('do.') ? 'do' : ev.startsWith('cron.') ? 'r2' : 'queue';
    return { code: ev.slice(0, 64) || 'pipeline.signal', stage, severity: 'medium' };
  }
  if (hay.includes('no such column') || hay.includes('sqlite_error')) {
    return { code: 'd1.schema_drift', stage: 'd1', severity: 'critical' };
  }
  return null;
}

export function isPipelineTelemetryEvent(event: string | null | undefined, message = ''): boolean {
  return classifyPipelineEvent(event, message) != null;
}

export const PIPELINE_RUNBOOKS: PipelineRunbook[] = [
  {
    id: 'pipe.do_flush',
    title: 'UserDO queue flush failed',
    checks: ['Check queue-flush 120KB budget', 'pullFromDo for oversized rows'],
    files: [
      'workers/auth-worker/src/features/ws/infrastructure/queue-flush.ts',
      'workers/auth-worker/src/features/ws/infrastructure/UserDO.ts',
    ],
    severityHint: 'high',
    match: (code) => code === 'do.flush_failed' || code === 'do.flush_oversized',
  },
  {
    id: 'pipe.pending_stuck',
    title: 'Pending stuck behind lastFlushedId',
    checks: ['UserDO /queue/health unhealthyTables', 'Alarm flush interval'],
    files: ['workers/auth-worker/src/features/ws/infrastructure/UserDO.ts'],
    severityHint: 'critical',
    match: (code) => code === 'do.pending_stuck' || code === 'do.alarm_gap',
  },
  {
    id: 'pipe.queue_chunk',
    title: 'Queue D1 chunk insert failed',
    checks: ['D1 schema vs Zod', 'batchInsertOrUpsert'],
    files: ['workers/queue-worker/src/index.ts', 'workers/queue-worker/src/database/index.ts'],
    severityHint: 'critical',
    match: (code) => code === 'queue.chunk_failed' || code === 'queue.pull_from_do_failed',
  },
  {
    id: 'pipe.unknown_table',
    title: 'Unknown sync table on queue',
    checks: ['SYNC_TABLE_NAMES vs UserDO sync list'],
    files: ['workers/queue-worker/src/index.ts'],
    severityHint: 'high',
    match: (code) => code === 'queue.unknown_table',
  },
  {
    id: 'pipe.dlq',
    title: 'Input queue dead-letter',
    checks: ['Poison message', 'Keep DLQ max_retries at 1'],
    files: ['workers/queue-worker/wrangler.jsonc', 'workers/queue-worker/src/index.ts'],
    severityHint: 'critical',
    match: (code) => code === 'queue.dlq',
  },
  {
    id: 'pipe.cleanup',
    title: 'D1 OK but DO cleanup failed',
    checks: ['/queue/cleanup mark path', 'Reconcile processed status'],
    files: ['workers/queue-worker/src/index.ts'],
    severityHint: 'high',
    match: (code) => code === 'queue.cleanup_failed',
  },
  {
    id: 'pipe.cron_table',
    title: 'd1tor2 pipeline table failed',
    checks: ['Pipeline endpoint', 'CATALOG token', 'schema'],
    files: ['workers/d1tor2-cron/src/pipelines/pipeline-manager.ts', 'workers/d1tor2-cron/src/index.ts'],
    severityHint: 'critical',
    match: (code) => code === 'cron.pipeline_failed' || code === 'cron.failed' || code === 'r2.endpoint_missing',
  },
  {
    id: 'pipe.retention',
    title: 'Archive freshness / retention',
    checks: ['Do not lower D1_RETENTION_DAYS while cron is red', 'System config d1tor2_cron'],
    files: ['workers/web/src/app/(main)/dashboard/system-config'],
    severityHint: 'high',
    match: (code) => code === 'r2.freshness_stale' || code === 'd1.hard_stop',
  },
];

export function matchPipelineRunbook(code: string, stage: PipelineStage, table: string | null): PipelineRunbook | null {
  return PIPELINE_RUNBOOKS.find((rb) => rb.match(code, stage, table)) ?? null;
}

export function extractTableFromPayload(payload: Record<string, unknown>, message = ''): string | null {
  const candidates = [payload.table, payload.tableName, (payload as { batchInfo?: { table?: unknown } }).batchInfo?.table];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && c.length < 64) return c;
  }
  const m = message.match(/\btable[=:\s]+([a-z_][a-z0-9_]*)/i);
  return m?.[1] ?? null;
}

/** Durable Object idFromString accepts 64-char hex ids. */
export function isValidDoUserId(userId: string): boolean {
  return /^[0-9a-f]{64}$/i.test(userId.trim());
}
