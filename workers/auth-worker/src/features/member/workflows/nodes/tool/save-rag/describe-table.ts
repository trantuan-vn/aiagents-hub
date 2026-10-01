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
- Do not invent columns.
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
  const parsed = parseJsonObject(text);
  return {
    tableSummaryVi: acceptField(parsed?.tableSummaryVi),
    tableSummaryEn: acceptField(parsed?.tableSummaryEn),
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

  const domainPrompt = (ctx.node.data as Record<string, unknown> | undefined)?.describeSystemPrompt;
  const columnSystem = composeDescribeSystem(COLUMN_SYSTEM, domainPrompt);
  const summarySystem = composeDescribeSystem(SUMMARY_SYSTEM, domainPrompt);

  const columns = await enrichColumnBatches(info.columns, async (take) => {
    const result = await runDescribe(columnSystem, buildColumnPrompt(info, take));
    return { records: salvageColumnRecords(result.text) };
  });

  let tableSummaryVi = '';
  let tableSummaryEn = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runDescribe(summarySystem, buildSummaryPrompt(info));
    const parsed = parseJsonObject(result.text);
    tableSummaryVi = acceptField(parsed?.tableSummaryVi);
    tableSummaryEn = acceptField(parsed?.tableSummaryEn);
    if (tableSummaryVi && tableSummaryEn) break;
  }
  if (!tableSummaryVi || !tableSummaryEn) {
    throw new Error(`save_rag: table ${info.tableName} summary incomplete`);
  }

  return {
    enrichment: { tableSummaryVi, tableSummaryEn, columns },
    llmCalls,
  };
}
