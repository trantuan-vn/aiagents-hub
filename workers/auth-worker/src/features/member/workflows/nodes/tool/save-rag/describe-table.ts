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

const DESCRIBE_SYSTEM = `You enrich Oracle table metadata for text-to-SQL retrieval.
Return ONLY one JSON object (no markdown fences) with this shape:
{
  "tableSummaryVi": string,
  "tableSummaryEn": string,
  "columns": [{ "name": string, "descriptionVi": string, "descriptionEn": string, "aliasesVi": string[] }],
  "typicalQueries": [{ "titleVi": string, "titleEn": string, "sql": string, "noteVi": string }]
}
Rules:
- column.name MUST match an Oracle column name from the input exactly (case-sensitive as given). Do not invent columns.
- descriptionVi / aliasesVi help Vietnamese questions map to English/Oracle column names.
- typicalQueries: 2–5 ordinary SELECT or WITH statements for this table (by PK, date filter, count, group-by, FK join if any). Qualify schema.table. Do NOT copy historical queries from the input.
- Keep descriptions short.`;

function truncateSamples(rows: Record<string, unknown>[], limit = 3): Record<string, unknown>[] {
  return rows.slice(0, limit).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v;
    }
    return out;
  });
}

function buildUserPrompt(info: GetDbInfoResult, history: SqlHistoryEntry[]): string {
  return JSON.stringify(
    {
      schemaName: info.schemaName,
      tableName: info.tableName,
      columns: info.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        default: c.default,
        comment: c.comment,
      })),
      primaryKey: info.primaryKey,
      foreignKeys: info.foreignKeys,
      sampleRows: truncateSamples(info.sampleRows),
      historicalSql: history.map((h) => h.sql).slice(0, 10),
    },
    null,
    2,
  );
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

function parseEnrichment(raw: unknown, info: GetDbInfoResult): TableEnrichment {
  const parsed = parseJsonObject(typeof raw === 'string' ? raw : String(raw ?? ''));
  const known = new Set(info.columns.map((c) => c.name));
  const columns: ColumnEnrichment[] = [];
  const rawCols = Array.isArray(parsed?.columns) ? parsed!.columns : [];
  for (const col of rawCols) {
    if (!col || typeof col !== 'object') continue;
    const rec = col as Record<string, unknown>;
    const name = String(rec.name ?? '').trim();
    if (!name || !known.has(name)) {
      if (name) console.warn(`[save-rag] LLM column "${name}" not in Oracle schema; skipped`);
      continue;
    }
    columns.push({
      name,
      descriptionVi: String(rec.descriptionVi ?? '').trim(),
      descriptionEn: String(rec.descriptionEn ?? '').trim(),
      aliasesVi: Array.isArray(rec.aliasesVi)
        ? rec.aliasesVi.map((a) => String(a).trim()).filter(Boolean)
        : [],
    });
  }

  const typicalQueries: TypicalQuery[] = [];
  const rawQueries = Array.isArray(parsed?.typicalQueries) ? parsed!.typicalQueries : [];
  for (const q of rawQueries) {
    if (!q || typeof q !== 'object') continue;
    const rec = q as Record<string, unknown>;
    const sql = String(rec.sql ?? '').trim();
    if (!isReadOnlySql(sql)) continue;
    typicalQueries.push({
      titleVi: String(rec.titleVi ?? '').trim() || 'Truy vấn',
      titleEn: String(rec.titleEn ?? '').trim() || 'Query',
      sql,
      noteVi: String(rec.noteVi ?? '').trim(),
    });
  }

  return {
    tableSummaryVi: String(parsed?.tableSummaryVi ?? '').trim(),
    tableSummaryEn: String(parsed?.tableSummaryEn ?? '').trim(),
    columns,
    typicalQueries,
  };
}

/** One chat call per table via handle `llm`. Bills as text generation. */
export async function describeTable(
  ctx: NodeContext,
  info: GetDbInfoResult,
): Promise<TableEnrichment> {
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

  const messages = [
    { role: 'system', content: DESCRIBE_SYSTEM },
    { role: 'user', content: buildUserPrompt(info, info.sqlHistory) },
  ];
  const maxTokens = Number(linked.serviceOptions?.maxTokens) || 2048;
  const aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens, {
    temperature: linked.serviceOptions?.temperature != null ? Number(linked.serviceOptions.temperature) : 0.2,
  });
  const text = extractTextFromAiResponse(aiResponse);
  const billing = ragBillingFromNodeContext(ctx);
  if (billing) {
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
      },
    );
    reportUsageCharge(billing.onCost, charge);
  }

  return parseEnrichment(text, info);
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
