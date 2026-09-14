import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentPlan, SafetyLevel } from './types.js';
import { ASK_USER_TOOL } from './types.js';

export type ToolClass = 'retrieve' | 'persist' | 'http_write' | 'http_read' | 'ask' | 'other';

export function classifyToolName(name: string, description = ''): ToolClass {
  const key = `${name} ${description}`.toLowerCase().replace(/-/g, '_');
  if (name === ASK_USER_TOOL || key.includes('ask_user')) return 'ask';
  if (/(get_rag|retrieve_memory|get_db_info|retrieve)/.test(key)) return 'retrieve';
  if (/save_rag|persist|upsert|write memory/.test(key)) return 'persist';
  if (/\b(post|put|patch|delete)\b/.test(key) && /http|calls /.test(key)) return 'http_write';
  if (/http|calls /.test(key)) return 'http_read';
  return 'other';
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
    if (kind === 'ask' || kind === 'retrieve' || kind === 'other' || kind === 'http_read') {
      out[name] = def;
      continue;
    }
    const allowedByPlan = planned.has(name) && (args.plan?.steps.some((s) => s.tool === name && s.risk !== 'high') ?? false);
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
): 'auto' | 'required' | { type: 'tool'; toolName: string } {
  if (!toolNames.length) return 'auto';
  const retrieve = toolNames.find((n) => classifyToolName(n) === 'retrieve');
  const plannedRetrieve = plan?.steps.find((s) => s.tool && classifyToolName(s.tool) === 'retrieve')?.tool;
  if (plannedRetrieve && toolNames.includes(plannedRetrieve)) {
    return { type: 'tool', toolName: plannedRetrieve };
  }
  if (retrieve) return 'required';
  return 'auto';
}

export function decorateToolDescription(name: string, description: string): string {
  const kind = classifyToolName(name, description);
  const when =
    kind === 'retrieve'
      ? 'When to use: before answering factual/SQL questions. When not: chit-chat or already-grounded answers.'
      : kind === 'persist'
        ? 'When to use: only if the user or plan asks to store knowledge. When not: routine Q&A.'
        : kind === 'http_write'
          ? 'When to use: only when the plan explicitly requires a write. When not: guessing IDs or destructive actions.'
          : kind === 'ask'
            ? 'When to use: required slots are missing and no tool can fill them. When not: you already have enough to answer.'
            : 'When to use: the plan names this tool. When not: guessing arguments.';
  return `${description} ${when}`.trim();
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
