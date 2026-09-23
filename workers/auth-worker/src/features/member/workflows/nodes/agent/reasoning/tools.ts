import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { toolClassForKind, toolClassForToolName } from '../../tool/shared/registry.js';
import type { AgentPlan, SafetyLevel } from './types.js';
import { ASK_USER_TOOL } from './types.js';

export type ToolClass =
  | 'retrieve'
  | 'persist'
  | 'validate'
  | 'delegate'
  | 'http_write'
  | 'http_read'
  | 'ask'
  | 'other';

export function classifyToolName(name: string, description = ''): ToolClass {
  const fromModule = toolClassForToolName(name);
  if (fromModule === 'delegate') return 'delegate';
  if (fromModule) return fromModule;

  const key = `${name} ${description}`.toLowerCase().replace(/-/g, '_');
  if (name === ASK_USER_TOOL || key.includes('ask_user')) return 'ask';
  if (/(^|_)codemode(_|$)|code_mode/.test(key.replace(/\s+/g, '_')) || /^codemode$/i.test(name)) {
    return 'delegate';
  }
  if (/(get_rag|retrieve_memory|get_db_info|retrieve)/.test(key)) return 'retrieve';
  if (/save_rag|persist|upsert|write memory/.test(key)) return 'persist';
  if (/check_sql|validate/.test(key)) return 'validate';
  if (/\b(post|put|patch|delete)\b/.test(key) && /http|calls /.test(key)) return 'http_write';
  if (/http|calls /.test(key)) return 'http_read';
  return 'other';
}

export function partitionToolNames(toolNames: string[]): {
  retrieve: string[];
  validate: string[];
  delegate: string[];
  other: string[];
} {
  const retrieve: string[] = [];
  const validate: string[] = [];
  const delegate: string[] = [];
  const other: string[] = [];
  for (const name of toolNames) {
    const kind = classifyToolName(name);
    if (kind === 'retrieve') retrieve.push(name);
    else if (kind === 'validate') validate.push(name);
    else if (kind === 'delegate') delegate.push(name);
    else other.push(name);
  }
  return { retrieve, validate, delegate, other };
}

/** Whether a linked tool_node kind should fold into Code Mode. */
export function isCodeModeInnerKind(kind: string): boolean {
  const cls = toolClassForKind(kind);
  return cls === 'retrieve' || cls === 'validate';
}

export function plannedToolNames(plan?: AgentPlan): Set<string> {
  const names = new Set<string>();
  for (const step of plan?.steps ?? []) {
    if (step.tool) names.add(step.tool);
  }
  return names;
}

export function filterToolsForPolicy(
  tools: ToolSet,
  args: { plan?: AgentPlan; safetyLevel: SafetyLevel },
): ToolSet {
  const planned = plannedToolNames(args.plan);
  const out: ToolSet = {};
  for (const [name, def] of Object.entries(tools)) {
    const description = String((def as { description?: string }).description ?? '');
    const kind = classifyToolName(name, description);
    if (
      kind === 'ask' ||
      kind === 'retrieve' ||
      kind === 'validate' ||
      kind === 'delegate' ||
      kind === 'other' ||
      kind === 'http_read'
    ) {
      out[name] = def;
      continue;
    }
    const allowedByPlan =
      planned.has(name) && (args.plan?.steps.some((s) => s.tool === name && s.risk !== 'high') ?? false);
    if (args.safetyLevel === 'strict' && !allowedByPlan) continue;
    if (kind === 'persist' || kind === 'http_write') {
      if (planned.size > 0 && !planned.has(name)) continue;
    }
    out[name] = def;
  }
  return out;
}

export function initialToolChoice(
  toolNames: string[],
  plan?: AgentPlan,
  alreadyGrounded = false,
  codeModeName?: string,
): 'auto' | 'required' | { type: 'tool'; toolName: string } {
  if (!toolNames.length) return 'auto';
  if (codeModeName && toolNames.includes(codeModeName)) {
    return { type: 'tool', toolName: codeModeName };
  }
  const retrieve = toolNames.find((n) => classifyToolName(n) === 'retrieve');
  const plannedRetrieve = plan?.steps.find((s) => s.tool && classifyToolName(s.tool) === 'retrieve')?.tool;
  if (plannedRetrieve && toolNames.includes(plannedRetrieve)) {
    return { type: 'tool', toolName: plannedRetrieve };
  }
  if (retrieve && !alreadyGrounded) return 'required';
  return 'auto';
}

export function decorateToolDescription(
  name: string,
  description: string,
  siblings?: { retrieve: string[]; validate: string[] },
): string {
  const kind = classifyToolName(name, description);
  const retrieveHint = siblings?.retrieve?.[0] ?? 'retrieve tools';
  const validateHint = siblings?.validate?.[0] ?? 'validate tools';
  const when =
    kind === 'retrieve'
      ? 'When to use: before answering when you need external context. When not: chit-chat or already-grounded answers.'
      : kind === 'persist'
        ? 'When to use: only if the user or plan asks to store knowledge. When not: routine Q&A.'
        : kind === 'validate'
          ? `When to use: after drafting an answer that must be checked. When ${validateHint} fails: call ${retrieveHint} again focused on the error, then rewrite and re-validate. When not: before you have a candidate.`
          : kind === 'delegate'
            ? `When to use: write one JavaScript async arrow function that orchestrates linked tools inside the sandbox (${retrieveHint} → draft → ${validateHint}). When not: simple chit-chat.`
            : kind === 'http_write'
              ? 'When to use: only when the plan explicitly requires a write. When not: guessing IDs or destructive actions.'
              : kind === 'ask'
                ? 'When to use: required slots are missing and no tool can fill them. When not: you already have enough to answer.'
                : 'When to use: the plan names this tool. When not: guessing arguments.';
  return `${description} ${when}`.trim();
}

/** Drop retrieve tools when upstream already grounded; keep them if any validate tool is linked. */
export function omitRetrieveWhenGrounded<T extends ToolSet>(tools: T, alreadyGrounded: boolean): T {
  if (!alreadyGrounded) return tools;
  const names = Object.keys(tools);
  if (names.some((n) => classifyToolName(n) === 'validate')) return tools;
  const next = { ...tools } as T;
  for (const name of names) {
    if (classifyToolName(name) === 'retrieve') {
      delete (next as Record<string, unknown>)[name];
    }
  }
  return next;
}

/** @deprecated Prefer omitRetrieveWhenGrounded */
export const omitGetRagWhenGrounded = omitRetrieveWhenGrounded;

function artifactFromPayload(payload: unknown, keys: string[]): string {
  if (!payload || typeof payload !== 'object') return '';
  const rec = payload as Record<string, unknown>;
  if (rec.ok === true) {
    for (const key of keys) {
      const value = rec[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  if (rec.result != null) return artifactFromPayload(rec.result, keys);
  return '';
}

const DEFAULT_VALIDATED_KEYS = ['sql', 'artifact', 'result'];

/** Prefer validated artifact from the last successful validate or Code Mode observation. */
export function validatedArtifactFromObservations(
  observations: Array<{ tool: string; ok: boolean; output?: unknown }>,
  keys: string[] = DEFAULT_VALIDATED_KEYS,
): string {
  for (let i = observations.length - 1; i >= 0; i--) {
    const o = observations[i]!;
    if (!o.ok) continue;
    const kind = classifyToolName(o.tool);
    if (kind !== 'validate' && kind !== 'delegate') continue;
    try {
      const parsed =
        typeof o.output === 'string' ? (JSON.parse(o.output) as unknown) : o.output;
      const value = artifactFromPayload(parsed, keys);
      if (value) return value;
    } catch {
      /* observation may be truncated non-JSON */
    }
  }
  return '';
}

/** Prefer SQL from validate/codemode observations (Text-to-SQL compat). */
export function validatedSqlFromObservations(
  observations: Array<{ tool: string; ok: boolean; output?: unknown }>,
): string {
  return validatedArtifactFromObservations(observations, ['sql']);
}

/** True when a validate/delegate tool returned a successful validated artifact. */
export function codeModeSucceeded(
  observations: Array<{ tool: string; ok: boolean; output?: unknown }>,
): boolean {
  return Boolean(validatedArtifactFromObservations(observations));
}

/** Build a short system overlay from linked tool classes (not hardcoding get_rag/check_sql). */
export function buildToolLoopGuidance(args: {
  usingCodeMode: boolean;
  codeModeName?: string;
  retrieve: string[];
  validate: string[];
}): string {
  const retrieve = args.retrieve.join(', ');
  const validate = args.validate.join(', ');
  if (args.usingCodeMode && args.codeModeName) {
    const inner =
      retrieve || validate
        ? `Inside the script call: ${[retrieve, validate].filter(Boolean).join(' then ')}.`
        : 'Inside the script call the available sandbox APIs.';
    return `Code Mode: write one JS async arrow function via ${args.codeModeName}. ${inner} On validate failure, re-retrieve focused on the error, repair, and re-validate (max 3). Return { ok: true, ... } only when validation succeeds.`;
  }
  if (retrieve && validate) {
    return `Tool loop: call ${retrieve} for context → draft an answer → call ${validate}. On ok: false, call ${retrieve} again focused on the error, rewrite, then ${validate} again. Only claim success after validation ok: true.`;
  }
  if (retrieve) {
    return `Use ${retrieve} when you need external context before answering. Do not invent facts that tools can fetch.`;
  }
  if (validate) {
    return `After drafting, call ${validate}. Only treat the draft as final when validation returns ok: true.`;
  }
  return '';
}

export function buildAskUserTool(): ToolSet {
  return {
    [ASK_USER_TOOL]: tool({
      description: decorateToolDescription(
        ASK_USER_TOOL,
        'Ask the user a clarifying question instead of guessing.',
      ),
      inputSchema: z.object({
        questions: z.array(z.string()).min(1).describe('Questions the user must answer'),
        why: z.string().optional().describe('Why the answer cannot be inferred'),
      }),
      execute: async ({ questions, why }: { questions: string[]; why?: string }) => ({
        questions,
        why: why ?? '',
        status: 'needs_clarification',
      }),
    }),
  };
}

export function maxActSteps(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8;
  return Math.min(12, Math.max(1, Math.floor(n)));
}
