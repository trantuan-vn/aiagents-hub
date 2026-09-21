export const OVERVIEW_CACHE_TTL_SECONDS = 60;
export const EVENTS_CACHE_TTL_SECONDS = 20;
export const REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const CF_API_TIMEOUT_MS = 8_000;
export const CF_API_SLOW_TIMEOUT_MS = 20_000;
export const EXCERPT_MAX_CHARS = 512;
export const OPEN_GROUP_CAP = 500;
export const GROUP_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const POLL_EVENT_LIMIT = 200;
export const LIVE_EVENT_LIMIT = 100;
export const LIVE_EVENT_MAX = 500;
export const OVERVIEW_CACHE_KV_KEY = 'cloudflare-logs-overview';
export const REFRESH_AT_KV_KEY = 'cloudflare-logs-refresh-at';

export type CloudflareLogsErrorCode =
  | 'token_missing'
  | 'observability_unreadable'
  | 'rate_limited'
  | 'invalid_status'
  | 'not_found';

export class CloudflareLogsError extends Error {
  readonly code: CloudflareLogsErrorCode;
  readonly status: 400 | 403 | 404 | 429 | 503;

  constructor(code: CloudflareLogsErrorCode, message: string, status: 400 | 403 | 404 | 429 | 503) {
    super(message);
    this.name = 'CloudflareLogsError';
    this.code = code;
    this.status = status;
  }
}

export type TimeRangeId = '1h' | '6h' | '24h' | '7d';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'unknown';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type GroupStatus = 'new' | 'ack' | 'investigating' | 'resolved' | 'ignored';
export type HandlerKind = 'fetch' | 'cron' | 'queue' | 'alarm' | 'ws' | 'rpc' | 'unknown';
export type HealthStatus = 'ok' | 'watch' | 'incident' | 'unavailable';

export const TIME_RANGE_MS: Record<TimeRangeId, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export const CRASH_OUTCOMES = ['exception', 'exceededCpu', 'exceededMemory'] as const;

/** Durable Object class names appear as $workers.scriptName on Observability Events. */
export const SCRIPT_NAME_ALIASES: Record<string, string> = {
  UserDO: 'aiagents-hub-auth-worker',
  UserShardDO: 'aiagents-hub-auth-worker',
  BroadcastServiceDO: 'aiagents-hub-auth-worker',
};

export function canonicalScriptName(name: string): string {
  return SCRIPT_NAME_ALIASES[name] ?? name;
}

export function scriptsForTelemetryFilter(script?: string, workerNames: readonly string[] = []): string[] {
  if (script) {
    const aliases = Object.entries(SCRIPT_NAME_ALIASES)
      .filter(([, parent]) => parent === script)
      .map(([alias]) => alias);
    return [script, ...aliases];
  }
  return [...workerNames, ...Object.keys(SCRIPT_NAME_ALIASES)];
}

export type WorkerHealth = {
  scriptName: string;
  requests: number;
  graphqlErrors: number;
  observabilityErrors: number | null;
  observabilityEvents: number | null;
  errorRatePct: number | null;
  http5xx: number | null;
  outcomes: Partial<Record<'ok' | 'exception' | 'exceededCpu' | 'exceededMemory' | 'unknown', number>>;
  cpuMsP50: number | null;
  cpuMsP99: number | null;
  sparkline: number[];
  status: HealthStatus;
  sampled: boolean;
};

export type ErrorGroup = {
  fingerprint: string;
  title: string;
  scriptName: string;
  component: string | null;
  event: string | null;
  severity: Severity;
  status: GroupStatus;
  count1h: number;
  count24h: number;
  countRange: number;
  firstSeen: string;
  lastSeen: string;
  source: 'hub_index' | 'live_cf' | 'dlq';
  runbookId: string | null;
  excerpt: string | null;
  sampled: boolean;
};

export type LogEventDto = {
  id: string;
  ts: string;
  scriptName: string;
  level: LogLevel;
  outcome: string | null;
  httpStatus: number | null;
  event: string | null;
  message: string;
  invocationId: string | null;
  payload: Record<string, unknown>;
};

export type ParsedLogEvent = {
  id: string;
  tsMs: number;
  scriptName: string;
  level: LogLevel;
  outcome: string | null;
  httpStatus: number | null;
  event: string | null;
  errorName: string | null;
  errorMessage: string | null;
  stackTop: string | null;
  pathOrQueue: string | null;
  handlerKind: HandlerKind;
  invocationId: string | null;
  component: string | null;
  message: string;
  payload: Record<string, unknown>;
};

export type Runbook = {
  id: string;
  title: string;
  checks: string[];
  files: string[];
  severityHint: Severity;
  match: (event: ParsedLogEvent | ErrorGroup) => boolean;
};

export type StabilityRecommendation = {
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

export type SamplingDigest = {
  scriptName: string;
  enabled: boolean;
  headSamplingRate: number | null;
  sampled: boolean;
};

export type LogsOverviewDto = {
  cachedAt: string;
  stale: boolean;
  range: TimeRangeId;
  workers: WorkerHealth[];
  openCount: number;
  new1h: number;
  sampling: SamplingDigest[];
  telemetryError?: string;
  graphqlError?: string;
};

export type GroupNote = {
  at: string;
  actor: string;
  status: GroupStatus | null;
  note: string | null;
};

const INFRA_SUBSTRINGS = [
  ' is not defined in environment variables',
  ' binding not configured',
  'Durable Object binding',
  ' not registered',
  'AI binding is not configured',
  'SYSTEM_CONFIG_KV not configured',
];

export function parseTimeRange(raw: string | undefined | null): TimeRangeId {
  if (raw === '6h' || raw === '24h' || raw === '7d' || raw === '1h') return raw;
  return '1h';
}

export function isGroupStatus(value: string): value is GroupStatus {
  return value === 'new' || value === 'ack' || value === 'investigating' || value === 'resolved' || value === 'ignored';
}

export function clipExcerpt(text: string, max = EXCERPT_MAX_CHARS): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function isInfraErrorMessage(message: string): boolean {
  return INFRA_SUBSTRINGS.some((s) => message.includes(s));
}

export function isCrashOutcome(outcome: string | null | undefined): boolean {
  return outcome === 'exception' || outcome === 'exceededCpu' || outcome === 'exceededMemory';
}

export function isPersistableError(event: ParsedLogEvent): boolean {
  if (event.level === 'warn' || event.level === 'debug') return false;
  if (isCrashOutcome(event.outcome)) return true;
  if (event.httpStatus != null && event.httpStatus >= 500) return true;
  if (event.level === 'error') return true;
  // CF Observability paints invocation lines as "info" even when $metadata.error exists.
  return Boolean(event.errorName || event.errorMessage);
}

export function severityForEvent(event: ParsedLogEvent): Severity {
  if (event.outcome === 'exceededCpu' || event.outcome === 'exceededMemory') return 'critical';
  const ev = event.event ?? '';
  if (ev.startsWith('cron.pipeline_failed') || ev === 'cron.failed' || ev.includes('dlq')) return 'critical';
  if (event.level === 'warn') return 'low';
  if (isCrashOutcome(event.outcome) || (event.httpStatus != null && event.httpStatus >= 500)) return 'high';
  if (isInfraErrorMessage(event.errorMessage ?? event.message)) return 'high';
  if (ev.startsWith('paypal.') || ev.startsWith('handler.request_error')) return 'medium';
  if (event.level === 'error') return 'medium';
  return 'low';
}

function haystack(row: ParsedLogEvent | ErrorGroup): string {
  const event = 'event' in row ? row.event ?? '' : '';
  const script = row.scriptName;
  const extra = 'errorMessage' in row ? `${row.errorMessage ?? ''} ${row.message}` : row.title;
  return `${script} ${event} ${extra}`.toLowerCase();
}

export const RUNBOOKS: Runbook[] = [
  {
    id: 'auth.handler_500',
    title: 'Auth handler returned 5xx',
    checks: ['Confirm operational vs infra in http-errors.ts', 'Inspect route prefix from excerpt'],
    files: ['workers/auth-worker/src/shared/http-errors.ts', 'workers/auth-worker/src/shared/utils.ts'],
    severityHint: 'high',
    match: (row) => {
      const ev = 'event' in row ? row.event ?? '' : '';
      return row.scriptName === 'aiagents-hub-auth-worker' && (ev === 'handler.request_error' || ev.startsWith('handler.'));
    },
  },
  {
    id: 'auth.paypal',
    title: 'PayPal catalog or subscription failed',
    checks: ['Secrets PayPal', 'Webhook verify', 'Plan catalog bootstrap'],
    files: [
      'workers/auth-worker/src/features/member/paypal/subscriptions.ts',
      'workers/auth-worker/src/features/member/paypal/catalog-bootstrap.ts',
    ],
    severityHint: 'high',
    match: (row) => haystack(row).includes('paypal.'),
  },
  {
    id: 'auth.workflow',
    title: 'Workflow executor failed',
    checks: ['Unknown node type', 'Agent serviceEndpoint', 'Node catalog'],
    files: ['workers/auth-worker/src/features/member/workflows/engine/executor.ts'],
    severityHint: 'high',
    match: (row) =>
      haystack(row).includes('unknown node type') ||
      (haystack(row).includes('workflow') && haystack(row).includes('executor')),
  },
  {
    id: 'auth.cron',
    title: 'Auth daily cron failed',
    checks: ['Contribution scan', 'usage sync', 'credit lots expire'],
    files: ['workers/auth-worker/src/index.ts'],
    severityHint: 'high',
    match: (row) =>
      row.scriptName === 'aiagents-hub-auth-worker' &&
      (haystack(row).includes('contribution') ||
        haystack(row).includes('credit_lots') ||
        haystack(row).includes('usage_sync') ||
        ('handlerKind' in row && row.handlerKind === 'cron')),
  },
  {
    id: 'queue.chunk',
    title: 'Queue D1 chunk insert failed',
    checks: ['D1 schema drift', 'chunk size', 'UserDO pull'],
    files: ['workers/queue-worker/src/index.ts'],
    severityHint: 'high',
    match: (row) => haystack(row).includes('queue.chunk_failed') || haystack(row).includes('queue.pull_from_do_failed'),
  },
  {
    id: 'queue.dlq',
    title: 'Queue dead-letter',
    checks: ['Poison message', 'Keep DLQ max_retries at 1'],
    files: ['workers/queue-worker/wrangler.jsonc', 'workers/queue-worker/src/index.ts'],
    severityHint: 'critical',
    match: (row) => haystack(row).includes('queue.dlq') || haystack(row).includes('error-queue-dlq'),
  },
  {
    id: 'consumer.ws',
    title: 'WS broadcast consumer failed',
    checks: ['UserShardDO hibernation', 'SHARD_COUNT', 'DLQ entry'],
    files: ['workers/consumer-worker/src/index.ts'],
    severityHint: 'high',
    match: (row) =>
      row.scriptName === 'aiagents-hub-consumer-worker' ||
      haystack(row).includes('consumer.message_failed') ||
      haystack(row).includes('consumer.dlq'),
  },
  {
    id: 'cron.pipeline',
    title: 'd1tor2 pipeline failed',
    checks: ['R2 Data Catalog', 'pipeline concurrency', 'schema run'],
    files: ['workers/d1tor2-cron/src/pipelines/pipeline-manager.ts', 'workers/d1tor2-cron/src/index.ts'],
    severityHint: 'critical',
    match: (row) =>
      row.scriptName === 'aiagents-hub-d1tor2-cron' ||
      haystack(row).includes('cron.pipeline_failed') ||
      haystack(row).includes('cron.failed'),
  },
  {
    id: 'web.ssr',
    title: 'OpenNext web 5xx or CPU',
    checks: ['cpu_ms = 300000', 'dynamic vs static assets', 'SSR error'],
    files: ['workers/web/wrangler.toml'],
    severityHint: 'high',
    match: (row) => row.scriptName === 'aiagents-hub-trading-sto',
  },
  {
    id: 'do.cpu',
    title: 'Durable Object exceeded CPU',
    checks: ['Avoid I/O in webSocketMessage', 'Hibernation'],
    files: ['workers/auth-worker/src/features/ws/infrastructure/UserDO.ts'],
    severityHint: 'critical',
    match: (row) =>
      ('outcome' in row ? row.outcome === 'exceededCpu' : haystack(row).includes('exceededcpu')) &&
      (haystack(row).includes('userdo') || haystack(row).includes('shard') || row.scriptName.includes('auth-worker')),
  },
];

export function matchRunbook(row: ParsedLogEvent | ErrorGroup): Runbook | null {
  return RUNBOOKS.find((rb) => rb.match(row)) ?? null;
}

export function healthStatus(errorRatePct: number | null, hasCritical: boolean): HealthStatus {
  if (hasCritical) return 'incident';
  if (errorRatePct == null) return 'ok';
  if (errorRatePct >= 2) return 'incident';
  if (errorRatePct >= 0.5) return 'watch';
  return 'ok';
}
