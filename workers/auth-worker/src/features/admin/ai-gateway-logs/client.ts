import { AI_GATEWAY_ID } from '../../member/workflows/ai/workers-ai.js';
import { readUsageToken } from '../cloudflare-usage/cloudflare-client.js';
import { CloudflareUsageError } from '../cloudflare-usage/domain.js';
import { createLogger } from '../../../shared/logger.js';
import {
  AiGatewayLogsError,
  GATEWAY_HEAD_CHAR_LIMIT,
  GATEWAY_LOG_PAGE_SIZE,
  isExecutionKey,
  logStatus,
  type GatewayLogDetail,
  type GatewayLogRow,
} from './domain.js';
import { redactGatewayPayload } from './redact.js';

const log = createLogger('auth-worker', 'ai-gateway-logs');
const CF_API = 'https://api.cloudflare.com/client/v4';

export type GatewayListFilter = {
  key: 'event_id' | 'created_at' | 'success' | 'cached' | 'model';
  operator: 'eq' | 'gt';
  value: string;
};

type GatewayListFields = {
  page: number;
  success?: boolean;
  cached?: boolean;
  model?: string;
  search?: string;
};

export type GatewayListQuery = GatewayListFields & {
  executionKey: string;
};

/** Phase 2 explorer. Never carries `event_id` — the window is `created_at` gt `since`. */
export type ExplorerListQuery = GatewayListFields & {
  since: string;
};

type FetchLike = typeof fetch;

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function isoFrom(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function appendSharedFilters(filters: GatewayListFilter[], query: GatewayListFields): void {
  if (query.success != null) {
    filters.push({ key: 'success', operator: 'eq', value: query.success ? 'true' : 'false' });
  }
  if (query.cached != null) {
    filters.push({ key: 'cached', operator: 'eq', value: query.cached ? 'true' : 'false' });
  }
  const model = query.model?.trim();
  if (model) filters.push({ key: 'model', operator: 'eq', value: model.slice(0, 200) });
}

/**
 * `filters` must be a JSON string; the API silently ignores the `filters[0][key]`, `filters[key]`
 * and `filters.key` forms and returns every log on the gateway.
 */
function toSearchParams(filters: GatewayListFilter[], query: GatewayListFields): URLSearchParams {
  const params = new URLSearchParams();
  params.set(
    'filters',
    JSON.stringify(filters.map((f) => ({ key: f.key, operator: f.operator, value: [f.value] }))),
  );
  params.set('order_by', 'created_at');
  params.set('order_by_direction', 'desc');
  params.set('page', String(Math.max(1, query.page)));
  params.set('per_page', String(GATEWAY_LOG_PAGE_SIZE));
  params.set('meta_info', 'true');
  const search = query.search?.trim();
  if (search) params.set('search', search.slice(0, 200));
  return params;
}

/**
 * Execution list. `event_id` is always the first filter; `search` never replaces it.
 */
export function buildLogsSearchParams(query: GatewayListQuery): URLSearchParams {
  const filters: GatewayListFilter[] = [
    { key: 'event_id', operator: 'eq', value: query.executionKey },
  ];
  appendSharedFilters(filters, query);
  return toSearchParams(filters, query);
}

/** Gateway explorer. Time window only — adding `event_id` here would hide logs that are not a run. */
export function buildExplorerSearchParams(query: ExplorerListQuery): URLSearchParams {
  const since = query.since.trim();
  if (!since || !Number.isFinite(Date.parse(since))) {
    throw new AiGatewayLogsError('invalid_range', 'range must be 1h, 24h, or 7d', 400);
  }
  const filters: GatewayListFilter[] = [{ key: 'created_at', operator: 'gt', value: since }];
  appendSharedFilters(filters, query);
  if (filters.some((filter) => filter.key === 'event_id')) {
    throw new AiGatewayLogsError('ai_gateway_error', 'Explorer list must not filter by event id', 500);
  }
  return toSearchParams(filters, query);
}

export function mapGatewayLogRow(raw: unknown): GatewayLogRow | null {
  try {
    const row = asRecord(raw);
    if (!row) return null;
    if (typeof row.id !== 'string' || !row.id.trim()) return null;
    if (typeof row.model !== 'string') return null;
    if (typeof row.success !== 'boolean' || typeof row.cached !== 'boolean') return null;
    const meta = parseMetadata(row.metadata);
    const duration = numOrNull(row.duration);
    const stamped = metaString(meta, 'executionKey');
    return {
      id: row.id,
      createdAt: isoFrom(row.created_at),
      status: logStatus(row.success, row.cached),
      provider: typeof row.provider === 'string' ? row.provider : '',
      model: row.model,
      tokensIn: numOrNull(row.tokens_in),
      tokensOut: numOrNull(row.tokens_out),
      costUsd: numOrNull(row.cost),
      durationMs: duration ?? 0,
      userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
      cached: row.cached,
      success: row.success,
      httpStatus: numOrNull(row.status_code),
      step: numOrNull(row.step),
      kind: metaString(meta, 'kind'),
      nodeId: metaString(meta, 'nodeId'),
      executionKey: stamped && isExecutionKey(stamped) ? stamped : null,
    };
  } catch {
    return null;
  }
}

export function prepareHead(raw: unknown, complete: unknown): { value: unknown; truncated: boolean } {
  let truncated = complete === false;
  let text = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
  if (text.length > GATEWAY_HEAD_CHAR_LIMIT) {
    text = text.slice(0, GATEWAY_HEAD_CHAR_LIMIT);
    truncated = true;
  }
  if (!text) return { value: null, truncated };
  try {
    return { value: redactGatewayPayload(JSON.parse(text)), truncated };
  } catch {
    return { value: text, truncated };
  }
}

function metadataRecord(raw: unknown): Record<string, string | number | boolean | null> {
  const parsed = parseMetadata(raw);
  const redacted = redactGatewayPayload(parsed ?? {});
  const record = asRecord(redacted) ?? {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value as string | number | boolean | null;
    }
  }
  return out;
}

export function mapGatewayLogDetail(raw: unknown): GatewayLogDetail | null {
  const row = mapGatewayLogRow(raw);
  const record = asRecord(raw);
  if (!row || !record) return null;
  const request = prepareHead(record.request_head, record.request_head_complete);
  const response = prepareHead(record.response_head, record.response_head_complete);
  return {
    ...row,
    endpoint: typeof record.path === 'string' ? record.path : '',
    requestType: typeof record.request_type === 'string' ? record.request_type : null,
    request: request.value,
    response: response.value,
    requestTruncated: request.truncated,
    responseTruncated: response.truncated,
    metadata: metadataRecord(record.metadata),
  };
}

export function executionKeyFromMetadata(raw: unknown): string | null {
  const meta = parseMetadata(raw);
  const key = meta?.executionKey;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

async function readToken(env: Env): Promise<string> {
  try {
    return await readUsageToken(env);
  } catch (e) {
    if (e instanceof CloudflareUsageError) {
      throw new AiGatewayLogsError(
        'ai_gateway_unreadable',
        'AI Gateway logs are unreadable',
        503,
      );
    }
    throw new AiGatewayLogsError('ai_gateway_unreadable', 'AI Gateway logs are unreadable', 503);
  }
}

function mapHttpError(status: number, executionKey: string, op: string): AiGatewayLogsError {
  log.warn('gateway.request_failed', { status, executionKey, op });
  if (status === 401 || status === 403) {
    return new AiGatewayLogsError('ai_gateway_unreadable', 'AI Gateway logs are unreadable', 503);
  }
  if (status === 404) {
    return new AiGatewayLogsError('log_gone', 'This log is no longer on the gateway', 404);
  }
  if (status === 429) {
    return new AiGatewayLogsError('rate_limited', 'AI Gateway rate limited the request', 429);
  }
  return new AiGatewayLogsError('ai_gateway_error', 'AI Gateway request failed', 502);
}

async function cfGet(env: Env, path: string, executionKey: string, op: string, fetchImpl: FetchLike): Promise<unknown> {
  const token = await readToken(env);
  const accountId = String(env.ACCOUNT_ID ?? '').trim();
  if (!accountId) {
    throw new AiGatewayLogsError('ai_gateway_unreadable', 'AI Gateway logs are unreadable', 503);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetchImpl(`${CF_API}${path}`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw mapHttpError(res.status, executionKey, op);
    try {
      return await res.json();
    } catch {
      log.warn('gateway.bad_json', { status: res.status, executionKey, op });
      throw new AiGatewayLogsError('ai_gateway_error', 'AI Gateway request failed', 502);
    }
  } catch (e) {
    if (e instanceof AiGatewayLogsError) throw e;
    log.warn('gateway.network', { status: 0, executionKey, op });
    throw new AiGatewayLogsError('ai_gateway_error', 'AI Gateway request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

export type ListedLogs = {
  rows: GatewayLogRow[];
  totalCount: number;
};

function logsPath(env: Env, params: URLSearchParams): string {
  return `/accounts/${encodeURIComponent(String(env.ACCOUNT_ID))}/ai-gateway/gateways/${AI_GATEWAY_ID}/logs?${params.toString()}`;
}

function parseListed(body: unknown): { raw: unknown[]; totalCount: number } {
  const record = asRecord(body) ?? {};
  const raw = Array.isArray(record.result) ? record.result : [];
  const total = numOrNull(asRecord(record.result_info)?.total_count);
  return { raw, totalCount: total ?? raw.length };
}

export async function listGatewayLogs(
  env: Env,
  query: GatewayListQuery,
  fetchImpl: FetchLike = fetch,
): Promise<ListedLogs> {
  const body = await cfGet(env, logsPath(env, buildLogsSearchParams(query)), query.executionKey, 'list', fetchImpl);
  const { raw, totalCount } = parseListed(body);
  const matched = raw.filter(
    (item) => executionKeyFromMetadata(asRecord(item)?.metadata) === query.executionKey,
  ).length;
  if (matched !== raw.length) {
    log.warn('gateway.filter_ignored', {
      status: 200,
      executionKey: query.executionKey,
      op: 'list',
      total: totalCount,
      rows: raw.length,
      matched,
    });
    throw new AiGatewayLogsError('ai_gateway_filter_ignored', 'AI Gateway ignored the event_id filter', 502);
  }
  return {
    rows: raw.map(mapGatewayLogRow).filter((row): row is GatewayLogRow => row != null),
    totalCount,
  };
}

export async function listExplorerGatewayLogs(
  env: Env,
  query: ExplorerListQuery,
  fetchImpl: FetchLike = fetch,
): Promise<ListedLogs> {
  const sinceMs = Date.parse(query.since);
  const body = await cfGet(env, logsPath(env, buildExplorerSearchParams(query)), 'explorer', 'list-all', fetchImpl);
  const { raw, totalCount } = parseListed(body);
  const rows: GatewayLogRow[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const rawCreated = record?.created_at;
    const created =
      typeof rawCreated === 'string' || typeof rawCreated === 'number' ? Date.parse(String(rawCreated)) : NaN;
    if (!Number.isFinite(created)) continue;
    if (created < sinceMs) {
      log.warn('gateway.filter_ignored', {
        status: 200,
        executionKey: 'explorer',
        op: 'list-all',
        total: totalCount,
        rows: raw.length,
      });
      throw new AiGatewayLogsError('ai_gateway_filter_ignored', 'AI Gateway ignored the time filter', 502);
    }
    const mapped = mapGatewayLogRow(item);
    if (mapped) rows.push(mapped);
  }
  return { rows, totalCount };
}

async function readGatewayLog(
  env: Env,
  logId: string,
  scope: string,
  op: string,
  fetchImpl: FetchLike,
): Promise<{ detail: GatewayLogDetail; result: unknown }> {
  const body = await cfGet(
    env,
    `/accounts/${encodeURIComponent(String(env.ACCOUNT_ID))}/ai-gateway/gateways/${AI_GATEWAY_ID}/logs/${encodeURIComponent(logId)}`,
    scope,
    op,
    fetchImpl,
  );
  const record = asRecord(body);
  const result = record && 'result' in record ? record.result : body;
  const detail = mapGatewayLogDetail(result);
  if (!detail) {
    throw new AiGatewayLogsError('ai_gateway_error', 'AI Gateway request failed', 502);
  }
  return { detail, result };
}

export async function getGatewayLog(
  env: Env,
  executionKey: string,
  logId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayLogDetail> {
  const { detail, result } = await readGatewayLog(env, logId, executionKey, 'detail', fetchImpl);
  const owner = executionKeyFromMetadata(asRecord(result)?.metadata);
  if (owner !== executionKey) {
    throw new AiGatewayLogsError('log_not_found', 'Log is not part of this execution', 404);
  }
  return detail;
}

/** Any gateway log. Used only by the explorer, which is labeled as not tied to one execution. */
export async function getExplorerGatewayLog(
  env: Env,
  logId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayLogDetail> {
  const { detail } = await readGatewayLog(env, logId, 'explorer', 'detail-all', fetchImpl);
  return detail;
}
