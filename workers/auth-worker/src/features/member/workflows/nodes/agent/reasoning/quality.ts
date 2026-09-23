import { REASONING_AGENT_DEFAULTS } from '@aiagents-hub/workflow-nodes';

import { extractSql } from '../shared.js';
import type { AgentCitation, ToolObservation } from './types.js';

export const DEFAULT_REFLECT_RETRIES = REASONING_AGENT_DEFAULTS.maxReflectRetries;
export const MAX_REFLECT_RETRIES = 8;
export const DEFAULT_NO_IMPROVEMENT_LIMIT = REASONING_AGENT_DEFAULTS.noImprovementLimit;
export const MIN_QUALITY_DELTA = 2;
export const COMPLETE_QUALITY_SCORE = 72;

/** Evaluation bias follows linked tools — not user/snippet regex alone. */
export type EvaluationMode = 'generic' | 'validated' | 'sql';

export function isSqlValidateToolName(name: string): boolean {
  return /check[_-]?sql|sql[_-]?valid/i.test(String(name ?? ''));
}

/**
 * SQL mode only when a SQL validate tool (or Code Mode wrapping one) is linked.
 * Schema snippets alone must not force Text-to-SQL scoring.
 */
export function resolveEvaluationMode(validateToolNames: string[]): EvaluationMode {
  if (validateToolNames.some(isSqlValidateToolName)) return 'sql';
  if (validateToolNames.length > 0) return 'validated';
  return 'generic';
}

/** Heuristic probe for tests / optional UI — not used to force SQL evaluation alone. */
export function looksLikeSqlTask(userText: string, snippets: string[]): boolean {
  const blob = `${userText}\n${snippets.join('\n')}`;
  return /CREATE TABLE|##\s*schema|```sql|\bSELECT\b|\bFROM\b/i.test(blob);
}

export function normalizeDraft(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function draftsEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (normalizeDraft(a) === normalizeDraft(b)) return true;
  const sqlA = extractSql(a);
  const sqlB = extractSql(b);
  if (sqlA && sqlB) return normalizeDraft(sqlA) === normalizeDraft(sqlB);
  return false;
}

function hasSuccessfulValidation(observations: ToolObservation[]): boolean {
  return observations.some((o) => {
    if (!o.ok) return false;
    try {
      const parsed =
        typeof o.output === 'string' ? (JSON.parse(o.output) as { ok?: unknown }) : o.output;
      if (parsed && typeof parsed === 'object' && 'ok' in (parsed as object)) {
        return (parsed as { ok?: unknown }).ok === true;
      }
    } catch {
      /* non-JSON success still counts as ok observation */
    }
    return true;
  });
}

export function scoreDraft(args: {
  text: string;
  issues: string[];
  citations: AgentCitation[];
  observations: ToolObservation[];
  snippets: string[];
  userText: string;
  mode?: EvaluationMode;
}): number {
  const text = String(args.text ?? '').trim();
  if (!text) return 0;
  const mode = args.mode ?? 'generic';

  let score = 50;
  score -= args.issues.length * 16;
  if (args.citations.length && /\[[1-9]\d*\]/.test(text)) score += 10;
  if (args.observations.some((o) => o.ok && String(o.output ?? '').trim())) score += 8;

  if (mode === 'sql') {
    const sql = extractSql(text);
    score += sql ? 28 : -22;
    if (sql && /\b(JOIN|WHERE|GROUP BY)\b/i.test(sql)) score += 6;
  } else if (mode === 'validated') {
    score += hasSuccessfulValidation(args.observations) ? 20 : -12;
    if (text.length > 80) score += 6;
  } else {
    if (text.length > 120) score += 8;
    // Any fenced code block counts as structured output (SQL, JSON, etc.) — not SQL-only.
    if (/```[\w+-]*\n[\s\S]+?```/.test(text)) score += 12;
  }

  if (text.length > 80) score += 4;
  if (args.snippets.length && /^(i (don't|do not) know|tôi không biết)/i.test(text)) score -= 12;
  return score;
}

export function shouldStopImproving(args: {
  pass: boolean;
  score: number;
  bestScore: number;
  stagnant: number;
  patience: number;
  isLastAttempt: boolean;
}): boolean {
  if (args.isLastAttempt) return true;
  if (args.stagnant < args.patience) return false;
  // Pass-complete drafts stop without requiring SQL-tuned COMPLETE_QUALITY_SCORE.
  if (args.pass) return true;
  if (args.bestScore >= COMPLETE_QUALITY_SCORE) return true;
  return false;
}
