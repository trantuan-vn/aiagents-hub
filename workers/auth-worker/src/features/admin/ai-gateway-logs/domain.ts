/**
 * Phase-1 ship marker. Executions that started before this and have zero
 * gateway rows were not stamped with eventId — do not invent a time-window join.
 */
export const AI_GATEWAY_STAMP_EPOCH_MS = Date.UTC(2026, 9, 2, 5, 10, 0);

export const GATEWAY_LOG_PAGE_SIZE = 24;
export const GATEWAY_SUMMARY_MAX_ROWS = 240;
export const GATEWAY_SUMMARY_MAX_PAGES = 10;
export const GATEWAY_LIST_CACHE_TTL_SEC = 20;
/** Cloudflare KV rejects `expirationTtl` below 60s; freshness is enforced via `expiresAt`. */
export const KV_MIN_EXPIRATION_TTL_SEC = 60;
export const GATEWAY_HEAD_CHAR_LIMIT = 1_500_000;
export const LIST_RATE_PER_MINUTE = 30;
export const DETAIL_RATE_PER_MINUTE = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GatewayLogStatus = 'success' | 'cached' | 'error';

export type GatewayLogRow = {
  id: string;
  createdAt: string;
  status: GatewayLogStatus;
  provider: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number;
  userAgent: string | null;
  cached: boolean;
  success: boolean;
  httpStatus: number | null;
  step: number | null;
  kind: string | null;
  nodeId: string | null;
  /** Set only when metadata carries a UUID. Absent on assistant, eKYC, and authoring calls. */
  executionKey: string | null;
};

export type GatewayLogDetail = GatewayLogRow & {
  endpoint: string;
  requestType: string | null;
  request: unknown;
  response: unknown;
  requestTruncated: boolean;
  responseTruncated: boolean;
  metadata: Record<string, string | number | boolean | null>;
};

export const EXPLORER_RANGES = ['1h', '24h', '7d'] as const;
export type ExplorerRange = (typeof EXPLORER_RANGES)[number];

export const EXPLORER_RANGE_MS: Record<ExplorerRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export type ExplorerGatewayReport = {
  scope: 'all';
  accountId: string;
  gatewayId: string;
  range: ExplorerRange;
  since: string;
  summary: {
    logCount: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    cached: number;
    errors: number;
    truncated: boolean;
  };
  logs: GatewayLogRow[];
  page: number;
  perPage: 24;
  totalCount: number;
};

export type ExecutionGatewayLink = 'stamped' | 'unstamped' | 'unavailable';

export type ExecutionGatewayReport = {
  link: ExecutionGatewayLink;
  accountId: string;
  gatewayId: string;
  execution: {
    executionKey: string;
    workflowId: number | null;
    workflowName: string | null;
    status: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    ownerHash: string | null;
  } | null;
  summary: {
    logCount: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    cached: number;
    errors: number;
    truncated: boolean;
  } | null;
  logs: GatewayLogRow[];
  page: number;
  perPage: 24;
  totalCount: number;
};

export class AiGatewayLogsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AiGatewayLogsError';
    this.code = code;
    this.status = status;
  }
}

export function isExecutionKey(raw: string): boolean {
  return UUID_RE.test(raw);
}

export function assertExecutionKey(raw: string): string {
  const key = raw.trim();
  if (!isExecutionKey(key)) {
    throw new AiGatewayLogsError('invalid_execution_key', 'executionKey must be a UUID', 400);
  }
  return key;
}

export function assertLogId(raw: string): string {
  const id = raw.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AiGatewayLogsError('invalid_log_id', 'log id is not valid', 400);
  }
  return id;
}

export function logStatus(success: boolean, cached: boolean): GatewayLogStatus {
  if (!success) return 'error';
  if (cached) return 'cached';
  return 'success';
}

/** Minute bucket so a 20s list cache can hit without widening the window by more than a minute. */
export function explorerSinceMs(range: ExplorerRange, now = Date.now()): number {
  const bucket = Math.floor(now / 60_000) * 60_000;
  return bucket - EXPLORER_RANGE_MS[range];
}

export function assertExplorerRange(raw: string | undefined): ExplorerRange {
  if (raw == null || raw === '') return '24h';
  if (raw === '1h' || raw === '24h' || raw === '7d') return raw;
  throw new AiGatewayLogsError('invalid_range', 'range must be 1h, 24h, or 7d', 400);
}
