import {
  asBillingAiResponse,
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../../billing/billing.js';
import { reportUsageCharge } from '../../../billing/charge.js';
import { resolveServiceOnHandle } from '../../../engine/graph-helpers.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { assertTextGenerationModel, parseJsonObject } from '../../agent/shared.js';
import type { GetDbInfoResult, SqlHistoryEntry } from '../shared/db/types.js';
import { ragBillingFromNodeContext } from '../shared/rag-context.js';

export type ColumnEnrichment = {
  name: string;
  descriptionVi: string;
  descriptionEn: string;
  aliasesVi: string[];
};

export type TypicalQuery = {
  titleVi: string;
  titleEn: string;
  sql: string;
  noteVi: string;
};

export type TableEnrichment = {
  tableSummaryVi: string;
  tableSummaryEn: string;
  columns: ColumnEnrichment[];
  typicalQueries: TypicalQuery[];
};

export type DescribeTableResult = {
  enrichment: TableEnrichment;
  llmCalls: number;
};

export const COLUMN_BATCH_START = 12;
export const COLUMN_DESC_MAX = 2000;

const COLUMN_SYSTEM = `You describe Oracle columns for text-to-SQL retrieval.
Return ONLY one JSON object (no markdown fences):
{ "columns": [{ "name": string, "descriptionVi": string, "descriptionEn": string, "aliasesVi": string[] }] }
Rules:
- Do not invent columns. name must be one of the columns in this request.
- descriptionVi and descriptionEn are each at most 2000 characters and must both be non-empty.
- aliasesVi are Vietnamese user phrases for that column.
- Describe only the columns listed in this request.`;

const SUMMARY_SYSTEM = `You summarize one Oracle table for text-to-SQL retrieval.
Return ONLY one JSON object: { "tableSummaryVi": string, "tableSummaryEn": string }
Both strings are required and non-empty. Do not invent columns.`;

const TYPICAL_SYSTEM = `You write typical read-only SQL for one Oracle table.
Return ONLY one JSON object:
{ "typicalQueries": [{ "titleVi": string, "titleEn": string, "sql": string, "noteVi": string }] }
Rules:
- 2 to 5 ordinary SELECT or WITH statements. Qualify schema.table.
- Do not copy historical queries from the input. No DML or DDL.`;

const EXTRA_REJECT =
  /response_format|json_object|chat_template|enable_thinking|unknown parameter|unrecognized/i;

function truncateSamples(rows: Record<string, unknown>[], limit = 3): Record<string, unknown>[] {
  return rows.slice(0, limit).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v;
    }
    return out;
  });
}

function promptSql(sql: string): string {
  return sql.length > 2000 ? `${sql.slice(0, 2000)}…` : sql;
}

export function resolveDescribeMaxTokens(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 1024) return 8192;
  return Math.floor(n);
}

function balancedObjectEnd(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Keep complete column objects. A trailing incomplete object is discarded. */
export function salvageColumnRecords(text: string): unknown[] {
  const parsed = parseJsonObject(text);
  if (parsed && Array.isArray(parsed.columns)) return parsed.columns;

  const records: unknown[] = [];
  const marker = text.indexOf('"columns"');
  let i = marker >= 0 ? marker : 0;
  while (i < text.length) {
    if (text[i] !== '{') {
      i += 1;
      continue;
    }
    const end = balancedObjectEnd(text, i);
    if (end < 0) break;
    try {
      const obj = JSON.parse(text.slice(i, end + 1)) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'name' in obj) records.push(obj);
    } catch {
      /* skip a brace pair that is not a column object */
    }
    i = end + 1;
  }
  return records;
}

export function matchBatchColumns(
  records: unknown[],
  known: Array<{ name: string }>,
): ColumnEnrichment[] {
  const exact = new Map(known.map((col) => [col.name, col.name]));
  const byUpper = new Map<string, string[]>();
  for (const col of known) {
    const key = col.name.toUpperCase();
    const list = byUpper.get(key) ?? [];
    list.push(col.name);
    byUpper.set(key, list);
  }

  const parsed = records
    .map((rec) => {
      if (!rec || typeof rec !== 'object') return null;
      const raw = rec as Record<string, unknown>;
      const name = String(raw.name ?? '').trim();
      if (!name) return null;
      return { name, raw };
    })
    .filter((row): row is { name: string; raw: Record<string, unknown> } => row != null);

  const used = new Set<string>();
  const accepted: Array<{ oracle: string; raw: Record<string, unknown> }> = [];

  const take = (oracle: string, raw: Record<string, unknown>) => {
    if (used.has(oracle)) return;
    used.add(oracle);
    accepted.push({ oracle, raw });
  };

  for (const row of parsed) {
    const oracle = exact.get(row.name);
    if (oracle) take(oracle, row.raw);
  }
  for (const row of parsed) {
    if (exact.has(row.name)) continue;
    const hits = byUpper.get(row.name.toUpperCase()) ?? [];
    if (hits.length === 1 && hits[0]) take(hits[0], row.raw);
    else console.warn(`[save-rag] LLM column "${row.name}" not in Oracle schema; skipped`);
  }

  const out: ColumnEnrichment[] = [];
  for (const { oracle, raw } of accepted) {
    const descriptionVi = String(raw.descriptionVi ?? '').trim();
    const descriptionEn = String(raw.descriptionEn ?? '').trim();
    if (!descriptionVi || !descriptionEn) continue;
    if (descriptionVi.length > COLUMN_DESC_MAX || descriptionEn.length > COLUMN_DESC_MAX) continue;
    out.push({
      name: oracle,
      descriptionVi,
      descriptionEn,
      aliasesVi: Array.isArray(raw.aliasesVi)
        ? raw.aliasesVi.map((alias) => String(alias).trim()).filter(Boolean)
        : [],
    });
  }
  return out;
}

export type BatchCallResult = { records: unknown[] };

/**
 * Describe columns in batches. A finished batch resets to 12.
 * A partial batch shrinks to floor(incomplete / 2). One column that fails twice throws.
 */
export async function enrichColumnBatches(
  columns: GetDbInfoResult['columns'],
  call: (take: GetDbInfoResult['columns']) => Promise<BatchCallResult>,
): Promise<ColumnEnrichment[]> {
  const done: ColumnEnrichment[] = [];
  let pending = [...columns];
  let batchSize = COLUMN_BATCH_START;
  const oneFails = new Map<string, number>();

  while (pending.length) {
    const take = pending.slice(0, Math.min(batchSize, pending.length));
    const result = await call(take);
    const matched = matchBatchColumns(result.records, take);
    const doneNames = new Set(matched.map((col) => col.name));
    done.push(...matched);
    pending = pending.filter((col) => !doneNames.has(col.name));
    const incomplete = take.filter((col) => !doneNames.has(col.name));
    if (!incomplete.length) {
      batchSize = COLUMN_BATCH_START;
      continue;
    }
    if (take.length === 1) {
      const name = take[0]!.name;
      const fails = (oneFails.get(name) ?? 0) + 1;
      oneFails.set(name, fails);
      if (fails >= 2) throw new Error(`save_rag: column "${name}" enrichment failed`);
      batchSize = 1;
      continue;
    }
    batchSize = Math.max(1, Math.floor(incomplete.length / 2));
  }

  return done;
}

function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!trimmed || /;/.test(trimmed)) return false;
  if (!/^(select|with)\b/i.test(trimmed)) return false;
  if (/\b(insert|update|delete|merge|drop|alter|truncate|grant|execute|begin|call)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

function parseTypicalQueries(text: string): TypicalQuery[] {
  const parsed = parseJsonObject(text);
  const rawQueries = Array.isArray(parsed?.typicalQueries) ? parsed.typicalQueries : [];
  const typicalQueries: TypicalQuery[] = [];
  for (const query of rawQueries) {
    if (!query || typeof query !== 'object') continue;
    const rec = query as Record<string, unknown>;
    const sql = String(rec.sql ?? '').trim();
    if (!isReadOnlySql(sql)) continue;
    typicalQueries.push({
      titleVi: String(rec.titleVi ?? '').trim() || 'Truy vấn',
      titleEn: String(rec.titleEn ?? '').trim() || 'Query',
      sql,
      noteVi: String(rec.noteVi ?? '').trim(),
    });
  }
  return typicalQueries;
}

function parseEnrichment(raw: unknown, info: GetDbInfoResult): TableEnrichment {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const parsed = parseJsonObject(text);
  return {
    tableSummaryVi: String(parsed?.tableSummaryVi ?? '').trim(),
    tableSummaryEn: String(parsed?.tableSummaryEn ?? '').trim(),
    columns: matchBatchColumns(salvageColumnRecords(text), info.columns),
    typicalQueries: parseTypicalQueries(text),
  };
}

function buildColumnPrompt(info: GetDbInfoResult, take: GetDbInfoResult['columns']): string {
  return JSON.stringify(
    {
      schemaName: info.schemaName,
      tableName: info.tableName,
      columns: take.map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        default: col.default,
        comment: col.comment,
      })),
      primaryKey: info.primaryKey,
      foreignKeys: info.foreignKeys,
      sampleRows: truncateSamples(info.sampleRows),
    },
    null,
    2,
  );
}

function buildSummaryPrompt(info: GetDbInfoResult): string {
  return JSON.stringify(
    {
      schemaName: info.schemaName,
      tableName: info.tableName,
      columns: info.columns.map((col) => col.name),
      primaryKey: info.primaryKey,
      foreignKeys: info.foreignKeys,
    },
    null,
    2,
  );
}

function buildTypicalPrompt(info: GetDbInfoResult, history: SqlHistoryEntry[]): string {
  return JSON.stringify(
    {
      schemaName: info.schemaName,
      tableName: info.tableName,
      columns: info.columns.map((col) => col.name),
      primaryKey: info.primaryKey,
      foreignKeys: info.foreignKeys,
      historicalSql: history.slice(0, 10).map((entry) => promptSql(entry.sql)),
    },
    null,
    2,
  );
}

/** Test helper — parse without calling the model. */
export function parseTableEnrichmentForTests(raw: string, info: GetDbInfoResult): TableEnrichment {
  return parseEnrichment(raw, info);
}

export function assertLlmServiceLinked(definition: WorkflowDefinition, nodeId: string): void {
  const linked = resolveServiceOnHandle(definition, nodeId, 'llm');
  if (!String(linked.endpoint ?? '').trim()) {
    throw new Error(
      'save_rag: connect a chat Service to the LLM handle (not the embed Service) before indexing tables',
    );
  }
}

/** Column batches, then one summary call, then one typical-query call. */
export async function describeTable(ctx: NodeContext, info: GetDbInfoResult): Promise<DescribeTableResult> {
  if (!info.columns.length) {
    throw new Error(`save_rag: table ${info.tableName} has no columns`);
  }

  const linked = resolveServiceOnHandle(ctx.definition, ctx.node.id, 'llm');
  const endpoint = String(linked.endpoint ?? '').trim();
  if (!endpoint) {
    throw new Error(
      'save_rag: connect a chat Service to the LLM handle (not the embed Service) before indexing tables',
    );
  }

  await ensureWalletBalance(ctx.userDO, ctx.c.env);
  const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
  const modelId = getModelForService(service);
  assertTextGenerationModel(modelId);

  const maxTokens = resolveDescribeMaxTokens(linked.serviceOptions?.maxTokens);
  const temperature =
    linked.serviceOptions?.temperature != null ? Number(linked.serviceOptions.temperature) : 0.2;
  const billing = ragBillingFromNodeContext(ctx);
  let llmCalls = 0;

  const bill = async (aiResponse: unknown, text: string) => {
    if (!billing) return;
    const charge = await billAgentUsage(
      billing.env,
      billing.bindingName,
      billing.userDO,
      billing.consumerIdentifier,
      service,
      {
        endpoint,
        aiResponse: asBillingAiResponse(aiResponse, text),
        userAgent: billing.requestMeta?.userAgent,
        ipAddress: billing.requestMeta?.ipAddress,
        workflowAttribution: billing.workflowAttribution
          ? {
              workflowId: billing.workflowAttribution.workflowId,
              workflowOwnerId: billing.workflowAttribution.workflowOwnerId,
            }
          : undefined,
        executionKey: billing.executionKey,
      },
    );
    reportUsageCharge(billing.onCost, charge);
  };

  const runDescribe = async (system: string, user: string): Promise<{ text: string; calls: number }> => {
    const glm = modelId.toLowerCase().includes('glm');
    const full: Record<string, unknown> = {
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      ...(glm ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    };
    const plain: Record<string, unknown> = { temperature, max_completion_tokens: maxTokens };
    const once = async (extra: Record<string, unknown>) => {
      llmCalls += 1;
      const aiResponse = await runTextModel(ctx.c.env, modelId, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], maxTokens, extra);
      const text = extractTextFromAiResponse(aiResponse);
      await bill(aiResponse, text);
      return text;
    };
    try {
      return { text: await once(full), calls: 1 };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!EXTRA_REJECT.test(message)) throw e;
      return { text: await once(plain), calls: 2 };
    }
  };

  const columns = await enrichColumnBatches(info.columns, async (take) => {
    const result = await runDescribe(COLUMN_SYSTEM, buildColumnPrompt(info, take));
    return { records: salvageColumnRecords(result.text) };
  });

  let tableSummaryVi = '';
  let tableSummaryEn = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runDescribe(SUMMARY_SYSTEM, buildSummaryPrompt(info));
    const parsed = parseJsonObject(result.text);
    tableSummaryVi = String(parsed?.tableSummaryVi ?? '').trim();
    tableSummaryEn = String(parsed?.tableSummaryEn ?? '').trim();
    if (tableSummaryVi && tableSummaryEn) break;
  }
  if (!tableSummaryVi || !tableSummaryEn) {
    throw new Error(`save_rag: table ${info.tableName} summary incomplete`);
  }

  let typicalQueries: TypicalQuery[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runDescribe(TYPICAL_SYSTEM, buildTypicalPrompt(info, info.sqlHistory));
    typicalQueries = parseTypicalQueries(result.text);
    if (typicalQueries.length) break;
  }

  return {
    enrichment: { tableSummaryVi, tableSummaryEn, columns, typicalQueries },
    llmCalls,
  };
}
