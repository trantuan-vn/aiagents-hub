import {
  asBillingAiResponse,
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../../billing/billing.js';
import { stampFromNode } from '../../../ai/workers-ai.js';
import { reportUsageCharge } from '../../../billing/charge.js';
import { resolveServiceOnHandle } from '../../../engine/graph-helpers.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { assertTextGenerationModel, parseJsonObject } from '../../agent/shared.js';
import type { GetDbInfoResult } from '../shared/db/types.js';
import { ragBillingFromNodeContext } from '../shared/rag-context.js';

export type ColumnEnrichment = {
  name: string;
  descriptionVi: string;
  descriptionEn: string;
  aliasesVi: string[];
};

export type TableEnrichment = {
  tableSummaryVi: string;
  tableSummaryEn: string;
  columns: ColumnEnrichment[];
};

export type DescribeTableResult = {
  enrichment: TableEnrichment;
  llmCalls: number;
};

export const COLUMN_BATCH_START = 12;
export const COLUMN_DESC_MAX = 240;

const JSON_WINS =
  'These JSON rules override any earlier instruction to return markdown, prose, or invented columns.';

export const COLUMN_SYSTEM = `You describe Oracle columns for text-to-SQL retrieval.
Return ONLY one JSON object (no markdown fences):
{ "columns": [{ "name": string, "descriptionVi": string, "descriptionEn": string, "aliasesVi": string[] }] }
Rules:
- ${JSON_WINS}
- Do not invent columns. name must be one of the columns in this request.
- descriptionVi and descriptionEn are each one sentence, at most 240 characters, and both must be non-empty.
- If the instructions above name domain terms, use those terms in both languages.
- aliasesVi are how a user refers to the column: everyday wording and the standard term.
- Describe only the columns listed in this request.`;

export const SUMMARY_SYSTEM = `You summarize one Oracle table for text-to-SQL retrieval.
Return ONLY one JSON object (no markdown fences):
{ "tableSummaryVi": string, "tableSummaryEn": string }
Rules:
- ${JSON_WINS}
- The user message is notes about the table. Do not return those notes, the column list, or schemaName.
- tableSummaryVi and tableSummaryEn are each one sentence, at most 240 characters, and both must be non-empty.
- If the instructions above name domain terms, use those terms in both languages.`;

/** Domain role first, then the fixed JSON rules. Blank prompt adds no role. */
export function composeDescribeSystem(rules: string, describeSystemPrompt: unknown): string {
  const domain = String(describeSystemPrompt ?? '').trim();
  if (!domain) return rules;
  return `${domain}\n\n${rules}`;
}

function acceptField(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text.length > COLUMN_DESC_MAX) return '';
  return text;
}

const SUMMARY_VI_KEYS = ['tableSummaryVi', 'table_summary_vi', 'summaryVi', 'summary_vi'] as const;
const SUMMARY_EN_KEYS = ['tableSummaryEn', 'table_summary_en', 'summaryEn', 'summary_en'] as const;

/** One sentence stored on the schema document. Longer model text is cut to 240 characters. */
export function clampSummaryField(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= COLUMN_DESC_MAX) return text;
  const sliced = text.slice(0, COLUMN_DESC_MAX);
  const space = sliced.lastIndexOf(' ');
  if (space >= Math.floor(COLUMN_DESC_MAX * 0.75)) return sliced.slice(0, space).trim();
  return sliced.trim();
}

function summaryFromParsed(parsed: Record<string, unknown> | null, keys: readonly string[]): string {
  if (!parsed) return '';
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) return clampSummaryField(value);
  }
  return '';
}

function summaryFromText(text: string, keys: readonly string[]): string {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
    const match = text.match(re);
    if (!match?.[1]) continue;
    let value = match[1];
    try {
      value = JSON.parse(`"${match[1]}"`) as string;
    } catch {
      /* keep the raw slice */
    }
    const clamped = clampSummaryField(value);
    if (clamped) return clamped;
  }
  return '';
}

function pushText(out: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) out.push(value);
}

/** Every string Workers AI or an OpenAI-style payload might have used for the completion. */
export function textsFromAiResponse(response: unknown): string[] {
  const out: string[] = [];
  if (typeof response === 'string') {
    pushText(out, response);
    return out;
  }
  if (!response || typeof response !== 'object') return out;
  const record = response as Record<string, unknown>;
  pushText(out, record.response);
  pushText(out, record.result);
  if (record.response && typeof record.response === 'object' && !Array.isArray(record.response)) {
    const parsed = record.response as Record<string, unknown>;
    pushText(out, parsed.description);
    if ('tableSummaryVi' in parsed || 'tableSummaryEn' in parsed || 'table_summary_vi' in parsed) {
      out.push(JSON.stringify(parsed));
    }
  }
  const choices = record.choices;
  if (!Array.isArray(choices)) return out;
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const item = choice as Record<string, unknown>;
    pushText(out, item.text);
    pushText(out, item.content);
    const message = item.message;
    if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
    const fields = message as Record<string, unknown>;
    pushText(out, fields.content);
    pushText(out, fields.reasoning);
    pushText(out, fields.reasoning_content);
  }
  return out;
}

function looksLikeSchemaDump(text: string): boolean {
  return text.includes('"schemaName"') && text.includes('"columns"') && !/tableSummary|summaryVi|summary_vi/i.test(text);
}

/** Prefer a payload that actually has both summaries. A copied schema JSON is not the answer. */
export function pickSummaryText(aiResponse: unknown, fallback: string): string {
  const texts = textsFromAiResponse(aiResponse);
  if (fallback.trim() && !texts.includes(fallback)) texts.unshift(fallback);
  for (const text of texts) {
    const summaries = readTableSummaries(text);
    if (summaries.tableSummaryVi && summaries.tableSummaryEn) return text;
  }
  return texts.find((text) => !looksLikeSchemaDump(text)) ?? texts[0] ?? fallback;
}

/** Accept a too-long sentence by shortening it. Also read snake_case keys and JSON buried in prose. */
export function readTableSummaries(text: string): { tableSummaryVi: string; tableSummaryEn: string } {
  const parsed = parseJsonObject(text);
  return {
    tableSummaryVi: summaryFromParsed(parsed, SUMMARY_VI_KEYS) || summaryFromText(text, SUMMARY_VI_KEYS),
    tableSummaryEn: summaryFromParsed(parsed, SUMMARY_EN_KEYS) || summaryFromText(text, SUMMARY_EN_KEYS),
  };
}

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
    const descriptionVi = acceptField(raw.descriptionVi);
    const descriptionEn = acceptField(raw.descriptionEn);
    if (!descriptionVi || !descriptionEn) continue;
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

function parseEnrichment(raw: unknown, info: GetDbInfoResult): TableEnrichment {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const summaries = readTableSummaries(text);
  return {
    tableSummaryVi: summaries.tableSummaryVi,
    tableSummaryEn: summaries.tableSummaryEn,
    columns: matchBatchColumns(salvageColumnRecords(text), info.columns),
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

/** Prose notes, not a JSON document. json_object mode otherwise copies schemaName and columns back. */
export function buildSummaryPrompt(info: GetDbInfoResult, attempt = 0): string {
  const table = info.schemaName ? `${info.schemaName}.${info.tableName}` : info.tableName;
  if (attempt > 0) {
    return [
      'The previous reply was rejected because it repeated the table metadata.',
      `Write one Vietnamese sentence and one English sentence about what ${table} stores.`,
      `Each sentence must be at most ${COLUMN_DESC_MAX} characters.`,
      'Return only this JSON object: {"tableSummaryVi":"...","tableSummaryEn":"..."}',
    ].join('\n');
  }
  const foreignKeys = info.foreignKeys
    .map((item) => `${item.column} -> ${item.refTable}.${item.refColumn}`)
    .filter((line) => !line.startsWith(' ->'))
    .join('; ');
  return [
    `Describe what Oracle table ${table} stores.`,
    `Column names: ${info.columns.map((col) => col.name).join(', ')}`,
    `Primary key: ${info.primaryKey.join(', ') || '(none)'}`,
    `Foreign keys: ${foreignKeys || '(none)'}`,
    'Return a new JSON object with only tableSummaryVi and tableSummaryEn.',
    'Each value is one sentence of at most 240 characters.',
    'Do not copy the column names back as the JSON.',
  ].join('\n');
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

/** Column batches, then one summary call. No typical-query call. */
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
  assertTextGenerationModel(
    modelId,
    'Save RAG: connect a chat model Service to the "LLM" handle; keep the embedding Service on the embed side.',
  );

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

  const runDescribe = async (
    system: string,
    user: string,
  ): Promise<{ text: string; calls: number; aiResponse: unknown }> => {
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
      ], maxTokens, extra, stampFromNode(ctx, 'text'));
      const text = extractTextFromAiResponse(aiResponse);
      await bill(aiResponse, text);
      return { text, aiResponse };
    };
    try {
      const first = await once(full);
      return { text: first.text, aiResponse: first.aiResponse, calls: 1 };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!EXTRA_REJECT.test(message)) throw e;
      const second = await once(plain);
      return { text: second.text, aiResponse: second.aiResponse, calls: 2 };
    }
  };

  const domainPrompt = (ctx.node.data as Record<string, unknown> | undefined)?.describeSystemPrompt;
  const columnSystem = composeDescribeSystem(COLUMN_SYSTEM, domainPrompt);
  const summarySystem = composeDescribeSystem(SUMMARY_SYSTEM, domainPrompt);

  const columns = await enrichColumnBatches(info.columns, async (take) => {
    const result = await runDescribe(columnSystem, buildColumnPrompt(info, take));
    return { records: salvageColumnRecords(result.text) };
  });

  let tableSummaryVi = '';
  let tableSummaryEn = '';
  let lastSummaryText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runDescribe(summarySystem, buildSummaryPrompt(info, attempt));
    lastSummaryText = pickSummaryText(result.aiResponse, result.text);
    const summaries = readTableSummaries(lastSummaryText);
    tableSummaryVi = summaries.tableSummaryVi;
    tableSummaryEn = summaries.tableSummaryEn;
    if (tableSummaryVi && tableSummaryEn) break;
  }
  if (!tableSummaryVi || !tableSummaryEn) {
    const missing = [!tableSummaryVi ? 'tableSummaryVi' : '', !tableSummaryEn ? 'tableSummaryEn' : '']
      .filter(Boolean)
      .join(' and ');
    const preview = lastSummaryText.replace(/\s+/g, ' ').trim().slice(0, 160);
    const detail = looksLikeSchemaDump(lastSummaryText)
      ? `missing ${missing}; model repeated the table metadata`
      : preview
        ? `missing ${missing}; model said: ${preview}`
        : `missing ${missing}; model returned empty text`;
    throw new Error(`save_rag: table ${info.tableName} summary incomplete (${detail})`);
  }

  return {
    enrichment: { tableSummaryVi, tableSummaryEn, columns },
    llmCalls,
  };
}
