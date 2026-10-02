import { AI_GATEWAY_ID } from '../../member/workflows/ai/workers-ai.js';
import { readUsageToken } from '../cloudflare-usage/cloudflare-client.js';
import { CloudflareUsageError } from '../cloudflare-usage/domain.js';
import { createLogger } from '../../../shared/logger.js';
import {
  AiGatewayLogsError,
  GATEWAY_HEAD_CHAR_LIMIT,
  GATEWAY_LOG_PAGE_SIZE,
  logStatus,
  type GatewayLogDetail,
  type GatewayLogRow,
} from './domain.js';
import { redactGatewayPayload } from './redact.js';

const log = createLogger('auth-worker', 'ai-gateway-logs');
const CF_API = 'https://api.cloudflare.com/client/v4';

export type GatewayListFilter = {
  key: 'event_id' | 'success' | 'cached' | 'model';
  operator: 'eq';
  value: string;
};

export type GatewayListQuery = {
  executionKey: string;
  page: number;
  success?: boolean;
  cached?: boolean;
  model?: string;
  search?: string;
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

/**
 * `filters` must be a JSON string; the API silently ignores the `filters[0][key]`, `filters[key]`
 * and `filters.key` forms and returns every log on the gateway.
 * `event_id` is always the first filter; `search` never replaces it.
 */
export function buildLogsSearchParams(query: GatewayListQuery): URLSearchParams {
  const filters: GatewayListFilter[] = [
    { key: 'event_id', operator: 'eq', value: query.executionKey },
  ];
  if (query.success != null) {
    filters.push({ key: 'success', operator: 'eq', value: query.success ? 'true' : 'false' });
  }
  if (query.cached != null) {
    filters.push({ key: 'cached', operator: 'eq', value: query.cached ? 'true' : 'false' });
  }
  const model = query.model?.trim();
  if (model) filters.push({ key: 'model', operator: 'eq', value: model.slice(0, 200) });

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

export function mapGatewayLogRow(raw: unknown): GatewayLogRow | null {
  try {
    const row = asRecord(raw);
    if (!row) return null;
    if (typeof row.id !== 'string' || !row.id.trim()) return null;
    if (typeof row.model !== 'string') return null;
    if (typeof row.success !== 'boolean' || typeof row.cached !== 'boolean') return null;
    const meta = parseMetadata(row.metadata);
    const duration = numOrNull(row.duration);
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

export async function listGatewayLogs(
  env: Env,
  query: GatewayListQuery,
  fetchImpl: FetchLike = fetch,
): Promise<ListedLogs> {
  const body = await cfGet(
    env,
    `/accounts/${encodeURIComponent(String(env.ACCOUNT_ID))}/ai-gateway/gateways/${AI_GATEWAY_ID}/logs?${buildLogsSearchParams(query).toString()}`,
    query.executionKey,
    'list',
    fetchImpl,
  );
  const record = asRecord(body) ?? {};
  const result = Array.isArray(record.result) ? record.result : [];
  const total = numOrNull(asRecord(record.result_info)?.total_count);
  const matched = result.filter(
    (raw) => executionKeyFromMetadata(asRecord(raw)?.metadata) === query.executionKey,
  ).length;
  if (matched !== result.length) {
    log.warn('gateway.filter_ignored', {
      status: 200,
      executionKey: query.executionKey,
      op: 'list',
      total,
      rows: result.length,
      matched,
    });
    throw new AiGatewayLogsError('ai_gateway_filter_ignored', 'AI Gateway ignored the event_id filter', 502);
  }
  return {
    rows: result.map(mapGatewayLogRow).filter((row): row is GatewayLogRow => row != null),
    totalCount: total ?? result.length,
  };
}

export async function getGatewayLog(
  env: Env,
  executionKey: string,
  logId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayLogDetail> {
  const body = await cfGet(
    env,
    `/accounts/${encodeURIComponent(String(env.ACCOUNT_ID))}/ai-gateway/gateways/${AI_GATEWAY_ID}/logs/${encodeURIComponent(logId)}`,
    executionKey,
    'detail',
    fetchImpl,
  );
  const record = asRecord(body);
  const result = record && 'result' in record ? record.result : body;
  const detail = mapGatewayLogDetail(result);
  if (!detail) {
    throw new AiGatewayLogsError('ai_gateway_error', 'AI Gateway request failed', 502);
  }
  const owner = executionKeyFromMetadata(asRecord(result)?.metadata);
  if (owner !== executionKey) {
    throw new AiGatewayLogsError('log_not_found', 'Log is not part of this execution', 404);
  }
  return detail;
}
