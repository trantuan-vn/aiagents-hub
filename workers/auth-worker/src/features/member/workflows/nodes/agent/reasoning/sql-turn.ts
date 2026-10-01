import { extractSql } from '../shared.js';
import { sandboxErrorFromOutput } from './ask-bag.js';
import { isSqlValidateToolName } from './quality.js';

const SCHEMA_SNIPPET = /CREATE TABLE|##\s*Schema|\|\s*Column\s*\|/i;

/** ragText, or a snippet that still looks like a table document, is enough to skip the frame LLM. */
export function hasGroundedSchema(ragText: string, snippets: readonly string[]): boolean {
  if (ragText.trim()) return true;
  return snippets.some((snippet) => SCHEMA_SNIPPET.test(snippet));
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

export function oracleErrorFromObservations(
  observations: Array<{ tool: string; output?: unknown }>,
): string {
  for (let i = observations.length - 1; i >= 0; i--) {
    const observation = observations[i]!;
    const tool = observation.tool.toLowerCase();
    const isSql = isSqlValidateToolName(observation.tool);
    const isCode = tool === 'codemode' || tool.includes('code_mode');
    if (!isSql && !isCode) continue;
    const error = sandboxErrorFromOutput(observation.output);
    if (error) return error.length > 500 ? error.slice(0, 500) : error;
  }
  return '';
}

/** Reflect sees the draft statement and the Oracle error, not the tool payload or schema. */
export function sqlReflectUser(draft: string, oracleError: string): string {
  const sql = extractSql(draft) || String(draft ?? '').trim();
  const error = oracleError.trim() || '(none)';
  return `Draft SQL:\n${sql}\n\nOracle error:\n${error}`;
}
