import { extractSql } from '../shared.js';
import type { ClarificationMode } from './types.js';

/**
 * Text-to-SQL turn: prompts and parsers for the host-driven
 * generate → execute → repair loop. The model only writes SQL;
 * retrieval and validation happen outside the model.
 */

const EMPTY_SCHEMA_LINE = '_Không có bảng liên quan. Không bịa tên cột._';
const MAX_CONTEXT_CHARS = 24_000;

export function isSqlValidateToolName(name: string): boolean {
  return /check[_-]?sql|sql[_-]?valid/i.test(String(name ?? ''));
}

/** The assembled "no tables" document. It is not schema. */
export function isUngroundedRagText(ragText: string): boolean {
  const text = ragText.trim();
  if (!text) return true;
  if (/\|\s*Column\s*\|/i.test(text) || /^#\s+[A-Za-z0-9_$.]+/m.test(text) || /```sql/i.test(text)) return false;
  return text.includes(EMPTY_SCHEMA_LINE);
}

function focusLine(error: string): string {
  const lines = error.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /ORA-\d+|invalid identifier|does not exist/i.test(line)) ?? lines[0] ?? error;
}

/** Identifier or missing table from an Oracle error. Never the user question. */
export function oracleRetrieveQuery(error: string): string {
  const text = String(error ?? '').trim();
  if (!text) return '';
  const focus = focusLine(text);
  const quoted = [...focus.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((name) => name.length > 0 && name.length <= 128 && !/\s/.test(name));
  if (quoted.length >= 2) return `${quoted[0]}.${quoted[1]}`.slice(0, 240);
  if (quoted.length === 1) return quoted[0]!.slice(0, 240);
  const dotted = focus.match(/\b([A-Za-z][A-Za-z0-9_$#]{0,30})\.([A-Za-z][A-Za-z0-9_$#]{0,30})\b/);
  if (dotted?.[1] && dotted[2]) return `${dotted[1]}.${dotted[2]}`.slice(0, 240);
  const bare = focus.match(/invalid identifier[:\s]+([A-Za-z][A-Za-z0-9_$#]{0,128})/i);
  if (bare?.[1]) return bare[1];
  return focus.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** Only identifier errors benefit from another schema lookup. Syntax errors do not. */
export function needsSchemaRefresh(error: string): boolean {
  return /ORA-00904|ORA-00942|ORA-00903|invalid identifier|does not exist|table or view/i.test(String(error ?? ''));
}

/** Validator could not run at all. Retrying or asking the user will not help. */
export function isValidatorConfigError(error: string): boolean {
  return /^Missing Oracle credentials/i.test(String(error ?? '').trim());
}

const SQL_RULES = `Text-to-SQL rules:
- Write exactly one read-only Oracle query (SELECT or WITH) that answers the question.
- Use only tables and columns that appear in the retrieved context. Never invent identifiers.
- Decide in one pass. Stop once the retrieved schema is enough to answer, or clearly is not.
- Reply with the query inside one \`\`\`sql fenced block and nothing else. No explanation.`;

const ASK_RULE = `- If the context has no table that can answer the question, or a required detail (period, entity, metric) is missing and cannot be inferred, do not write SQL. Reply with exactly one line instead: ASK: <one short question in the user's language>`;

const BEST_EFFORT_RULE = `- If a detail is missing, make the most reasonable assumption and still write the query.`;

export function sqlSystemPrompt(args: {
  userSystem: string;
  clarificationMode: ClarificationMode;
  workflowDescription?: string;
  sessionSummary?: string;
  historyText?: string;
}): string {
  return [
    args.userSystem.trim(),
    SQL_RULES,
    args.clarificationMode === 'ask' ? ASK_RULE : BEST_EFFORT_RULE,
    args.workflowDescription?.trim() ? `Workflow: ${args.workflowDescription.trim()}` : '',
    args.sessionSummary?.trim() ? `Session memory:\n${args.sessionSummary.trim()}` : '',
    args.historyText?.trim() ? `Previous conversation:\n${args.historyText.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Retrieved schema belongs on the user message only. System stays instructions. */
export function withRetrievedContext(body: string, ragText: string): string {
  const context = ragText.trim();
  if (!context || body.includes(context)) return body;
  const block = `Retrieved schema and SQL examples:\n${context}`;
  return body.trim() ? `${body.trim()}\n\n${block}` : block;
}

export function sqlRepairSuffix(previousSql: string, error: string): string {
  const sql = previousSql.trim();
  return [
    '',
    sql ? `Previous SQL:\n${sql}` : 'Previous reply did not contain SQL.',
    `Oracle error:\n${error.trim() || '(none)'}`,
    'Fix the query using the retrieved context. Reply with one ```sql block only.',
  ].join('\n\n');
}

/** Later schema is appended so joins from the first lookup survive. Over the cap, the newest wins. */
export function mergeSchemaContext(previous: string, next: string, max = MAX_CONTEXT_CHARS): string {
  const prev = previous.trim();
  const add = next.trim();
  if (!add) return prev;
  if (!prev || isUngroundedRagText(prev)) return add;
  if (prev.includes(add)) return prev;
  const merged = `${prev}\n\n${add}`;
  return merged.length > max ? add : merged;
}

export type SqlReply = { sql: string; ask: string };

/** SQL wins over ASK. Chain-of-thought blocks are ignored. */
export function parseSqlReply(text: unknown): SqlReply {
  const raw = typeof text === 'string' ? text : '';
  const visible = raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<\/?think>/gi, ' ').trim();
  const sql = extractSql(visible);
  if (sql) return { sql, ask: '' };
  const ask = visible.match(/^\s*ASK\s*:\s*(.+?)\s*$/im)?.[1] ?? '';
  return { sql: '', ask: ask.replace(/^["'“]+|["'”]+$/g, '').trim() };
}
