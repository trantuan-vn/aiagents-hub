import { REASONING_AGENT_DEFAULTS } from '@aiagents-hub/workflow-nodes';

import { extractSql } from '../shared.js';
import type { AgentCitation, ToolObservation } from './types.js';

export const DEFAULT_REFLECT_RETRIES = REASONING_AGENT_DEFAULTS.maxReflectRetries;
export const MAX_REFLECT_RETRIES = 8;
export const DEFAULT_NO_IMPROVEMENT_LIMIT = REASONING_AGENT_DEFAULTS.noImprovementLimit;
export const MIN_QUALITY_DELTA = 2;
export const COMPLETE_QUALITY_SCORE = 72;

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

export function scoreDraft(args: {
  text: string;
  issues: string[];
  citations: AgentCitation[];
  observations: ToolObservation[];
  snippets: string[];
  userText: string;
}): number {
  const text = String(args.text ?? '').trim();
  if (!text) return 0;

  let score = 50;
  score -= args.issues.length * 16;
  if (args.citations.length && /\[[1-9]\d*\]/.test(text)) score += 10;
  if (args.observations.some((o) => o.ok && String(o.output ?? '').trim())) score += 8;

  const sql = extractSql(text);
  if (looksLikeSqlTask(args.userText, args.snippets)) {
    score += sql ? 28 : -22;
    if (sql && /\b(JOIN|WHERE|GROUP BY)\b/i.test(sql)) score += 6;
  } else if (text.length > 120) {
    score += 8;
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
  if (args.stagnant >= args.patience && args.bestScore >= COMPLETE_QUALITY_SCORE) return true;
  return false;
}
