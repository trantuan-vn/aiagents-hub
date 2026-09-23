import { extractSql } from '../shared.js';
import { claimsNeedCitations, parseCitationIds } from './cite.js';
import type { EvaluationMode } from './quality.js';
import type { AgentCitation, TaskFrame, ToolObservation } from './types.js';

export type ReflectVerdict = {
  pass: boolean;
  issues: string[];
  rewritten?: string;
};

function validationSucceeded(observations: ToolObservation[]): boolean {
  for (let i = observations.length - 1; i >= 0; i--) {
    const o = observations[i]!;
    if (!o.ok) continue;
    try {
      const parsed =
        typeof o.output === 'string' ? (JSON.parse(o.output) as { ok?: unknown }) : o.output;
      if (parsed && typeof parsed === 'object' && 'ok' in (parsed as object)) {
        if ((parsed as { ok?: unknown }).ok === true) return true;
        continue;
      }
    } catch {
      /* fall through */
    }
    return true;
  }
  return false;
}

export function reflectHeuristics(args: {
  text: string;
  citations: AgentCitation[];
  observations: ToolObservation[];
  frame: TaskFrame;
  requireCitations: boolean;
  userText?: string;
  snippets?: string[];
  mode?: EvaluationMode;
}): ReflectVerdict {
  const issues: string[] = [];
  const text = String(args.text ?? '').trim();
  if (!text) issues.push('empty_answer');

  if (args.frame.missingSlots.length > 0 && !/[?？]/.test(text)) {
    issues.push('unresolved_slots');
  }

  if (claimsNeedCitations(text, args.requireCitations) && args.citations.length > 0) {
    issues.push('missing_citations');
  }

  const cited = new Set(parseCitationIds(text));
  for (const id of cited) {
    if (!args.citations.some((c) => c.id === id)) issues.push(`unknown_citation:${id}`);
  }

  const failedTools = args.observations.filter((o) => !o.ok);
  if (failedTools.length && /definitely|certainly|chắc chắn/i.test(text)) {
    issues.push('overconfident_after_tool_error');
  }

  const mode = args.mode ?? 'generic';
  if (mode === 'sql' && !extractSql(text) && !validationSucceeded(args.observations)) {
    issues.push('missing_sql');
  } else if (mode === 'validated' && !validationSucceeded(args.observations)) {
    issues.push('missing_validated_artifact');
  }

  return { pass: issues.length === 0, issues };
}

export function parseReflect(raw: Record<string, unknown> | null, fallback: ReflectVerdict): ReflectVerdict {
  if (!raw) return fallback;
  const issues = Array.isArray(raw.issues) ? raw.issues.map((s) => String(s)) : fallback.issues;
  const pass = raw.pass == null ? issues.length === 0 : Boolean(raw.pass);
  const rewritten = raw.rewritten ? String(raw.rewritten) : undefined;
  return { pass, issues, rewritten };
}

export const REFLECT_PROMPT = `Critique the draft answer. Reply with JSON only:
{"pass":true,"issues":[],"rewritten":""}
Fail if claims lack [n] citations when sources were provided, if missing slots remain, if a linked validate tool never returned ok: true when validation was required, or if the answer contradicts tool results. Put a corrected answer in rewritten when pass is false. Set pass true only when the draft is complete and cannot be improved.`;
