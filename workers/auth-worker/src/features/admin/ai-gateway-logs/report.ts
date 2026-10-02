import { AI_GATEWAY_ID } from '../../member/workflows/ai/workers-ai.js';
import {
  AiGatewayLogsError,
  AI_GATEWAY_STAMP_EPOCH_MS,
  assertExecutionKey,
  assertLogId,
  DETAIL_RATE_PER_MINUTE,
  GATEWAY_LIST_CACHE_TTL_SEC,
  GATEWAY_LOG_PAGE_SIZE,
  GATEWAY_SUMMARY_MAX_PAGES,
  GATEWAY_SUMMARY_MAX_ROWS,
  KV_MIN_EXPIRATION_TTL_SEC,
  LIST_RATE_PER_MINUTE,
  type ExecutionGatewayReport,
  type GatewayLogDetail,
  type GatewayLogRow,
} from './domain.js';
import { getGatewayLog, listGatewayLogs, type GatewayListQuery } from './client.js';

type FetchLike = typeof fetch;

export type ExecutionLogFilters = {
  page?: number;
  success?: boolean;
  cached?: boolean;
  model?: string;
  search?: string;
};

type LedgerRow = {
  executionKey: string;
  workflowId?: number;
  workflowName?: string | null;
  status?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  user_id?: string | null;
};

function pageOf(raw: number | undefined): number {
  const n = Math.floor(Number(raw ?? 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

async function sha16(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function consumeRate(env: Env, adminId: string, kind: 'list' | 'detail'): Promise<void> {
  const kv = env.SYSTEM_CONFIG_KV;
  if (!kv) return;
  const limit = kind === 'list' ? LIST_RATE_PER_MINUTE : DETAIL_RATE_PER_MINUTE;
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `ai-gateway-rl:${kind}:${await sha16(adminId)}:${bucket}`;
  const current = Number((await kv.get(key)) ?? '0') || 0;
  if (current >= limit) {
    throw new AiGatewayLogsError('rate_limited', 'Too many AI Gateway log requests', 429);
  }
  await kv.put(key, String(current + 1), { expirationTtl: 120 });
}

async function loadLedger(env: Env, executionKey: string): Promise<LedgerRow | null> {
  const db = env.D1DB;
  if (!db) return null;
  try {
    return await db
      .prepare(
        `SELECT executionKey, workflowId, workflowName, status, startedAt, finishedAt, user_id
         FROM workflow_executions WHERE executionKey = ? LIMIT 1`,
      )
      .bind(executionKey)
      .first<LedgerRow>();
  } catch {
    return null;
  }
}

async function ownerHash(userId: string | null | undefined): Promise<string | null> {
  const id = String(userId ?? '').trim();
  if (!id) return null;
  return sha16(id);
}

function emptySummary() {
  return {
    logCount: 0,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    cached: 0,
    errors: 0,
    truncated: false,
  };
}

function addRow(
  summary: ReturnType<typeof emptySummary>,
  row: GatewayLogRow,
): void {
  summary.costUsd += row.costUsd ?? 0;
  summary.tokensIn += row.tokensIn ?? 0;
  summary.tokensOut += row.tokensOut ?? 0;
  if (row.success && row.cached) summary.cached += 1;
  if (!row.success) summary.errors += 1;
}

async function summarize(
  env: Env,
  base: Omit<GatewayListQuery, 'page'>,
  fetchImpl: FetchLike,
): Promise<ReturnType<typeof emptySummary>> {
  const summary = emptySummary();
  let seen = 0;
  let total = 0;
  for (let page = 1; page <= GATEWAY_SUMMARY_MAX_PAGES; page += 1) {
    const listed = await listGatewayLogs(env, { ...base, page }, fetchImpl);
    total = listed.totalCount;
    if (!listed.rows.length) break;
    for (const row of listed.rows) {
      if (seen >= GATEWAY_SUMMARY_MAX_ROWS) break;
      addRow(summary, row);
      seen += 1;
    }
    if (seen >= GATEWAY_SUMMARY_MAX_ROWS || seen >= total) break;
  }
  summary.logCount = total;
  summary.truncated = total > GATEWAY_SUMMARY_MAX_ROWS;
  return summary;
}

function cacheKey(executionKey: string, filterHash: string, page: number): string {
  return `ai-gateway-exec-logs:${executionKey}:${filterHash}:${page}`;
}

export async function getExecutionGatewayReport(
  env: Env,
  adminId: string,
  executionKey: string,
  filters: ExecutionLogFilters,
  fetchImpl: FetchLike = fetch,
): Promise<ExecutionGatewayReport> {
  executionKey = assertExecutionKey(executionKey);
  await consumeRate(env, adminId, 'list');
  const page = pageOf(filters.page);
  const queryBase = {
    executionKey,
    success: filters.success,
    cached: filters.cached,
    model: filters.model?.trim() || undefined,
    search: filters.search?.trim() || undefined,
  };
  const filterHash = await sha16(JSON.stringify({ ...queryBase, page }));
  const kv = env.SYSTEM_CONFIG_KV;
  const key = cacheKey(executionKey, filterHash, page);
  if (kv) {
    const hit = await kv.get(key);
    if (hit) {
      try {
        const entry = JSON.parse(hit) as { expiresAt?: number; report?: ExecutionGatewayReport };
        const parsed = entry?.report;
        const fresh = typeof entry?.expiresAt === 'number' && entry.expiresAt > Date.now();
        if (fresh && parsed && Array.isArray(parsed.logs)) {
          if (parsed.execution?.executionKey === executionKey || parsed.execution == null) return parsed;
        }
      } catch {
        /* refetch */
      }
    }
  }

  const [ledger, listed, summary] = await Promise.all([
    loadLedger(env, executionKey),
    listGatewayLogs(env, { ...queryBase, page }, fetchImpl),
    summarize(env, queryBase, fetchImpl),
  ]);

  const startedAt = ledger?.startedAt ?? null;
  const unfiltered =
    filters.success == null && filters.cached == null && !queryBase.model && !queryBase.search;
  const link =
    unfiltered &&
    listed.totalCount === 0 &&
    ledger &&
    typeof startedAt === 'number' &&
    startedAt < AI_GATEWAY_STAMP_EPOCH_MS
      ? 'unstamped'
      : 'stamped';

  const report: ExecutionGatewayReport = {
    link,
    accountId: String(env.ACCOUNT_ID ?? ''),
    gatewayId: AI_GATEWAY_ID,
    execution: ledger
      ? {
          executionKey,
          workflowId: ledger.workflowId ?? null,
          workflowName: ledger.workflowName ?? null,
          status: ledger.status ?? null,
          startedAt,
          finishedAt: ledger.finishedAt ?? null,
          ownerHash: await ownerHash(ledger.user_id),
        }
      : null,
    summary,
    logs: listed.rows,
    page,
    perPage: GATEWAY_LOG_PAGE_SIZE,
    totalCount: listed.totalCount,
  };

  if (kv) {
    const entry = { expiresAt: Date.now() + GATEWAY_LIST_CACHE_TTL_SEC * 1000, report };
    try {
      await kv.put(key, JSON.stringify(entry), { expirationTtl: KV_MIN_EXPIRATION_TTL_SEC });
    } catch {
      /* cache is best-effort */
    }
  }
  return report;
}

export async function getExecutionGatewayLogDetail(
  env: Env,
  adminId: string,
  executionKey: string,
  logId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayLogDetail> {
  executionKey = assertExecutionKey(executionKey);
  logId = assertLogId(logId);
  await consumeRate(env, adminId, 'detail');
  return getGatewayLog(env, executionKey, logId, fetchImpl);
}
