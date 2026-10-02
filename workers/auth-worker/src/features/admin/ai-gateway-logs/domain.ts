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

export function assertExecutionKey(raw: string): string {
  const key = raw.trim();
  if (!UUID_RE.test(key)) {
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
