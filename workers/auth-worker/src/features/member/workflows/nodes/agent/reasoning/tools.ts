import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { toolClassForToolName } from '../../tool/shared/registry.js';
import type { SafetyLevel } from './types.js';
import { ASK_USER_TOOL, MAX_ACT_STEPS } from './types.js';

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
  if (fromModule) return fromModule;

  const key = `${name} ${description}`.toLowerCase().replace(/-/g, '_');
  if (name === ASK_USER_TOOL || key.includes('ask_user')) return 'ask';
  if (/(^|_)codemode(_|$)|code_mode/.test(key.replace(/\s+/g, '_'))) return 'delegate';
  if (/(get_rag|retrieve_memory|get_db_info|retrieve)/.test(key)) return 'retrieve';
  if (/save_rag|persist|upsert|write memory/.test(key)) return 'persist';
  if (/check_sql|validate/.test(key)) return 'validate';
  if (/\b(post|put|patch|delete)\b/.test(key) && /http|calls /.test(key)) return 'http_write';
  if (/http|calls /.test(key)) return 'http_read';
  return 'other';
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

/** Strict mode hides tools that write (persist, HTTP mutations). */
export function filterToolsForSafety(tools: ToolSet, level: SafetyLevel): ToolSet {
  if (level !== 'strict') return tools;
  const out: ToolSet = {};
  for (const [name, def] of Object.entries(tools)) {
    const kind = classifyToolName(name, String((def as { description?: string }).description ?? ''));
    if (kind === 'persist' || kind === 'http_write') continue;
    out[name] = def;
  }
  return out;
}

export function buildAskUserTool(): ToolSet {
  return {
    [ASK_USER_TOOL]: tool({
      description:
        'Ask the user a clarifying question instead of guessing. Use only when required details are missing and no other tool can fill them.',
      inputSchema: z.object({
        questions: z.array(z.string()).min(1).describe('Questions the user must answer'),
        why: z.string().optional().describe('Why the answer cannot be inferred'),
      }),
      execute: async ({ questions, why }: { questions: string[]; why?: string }) => ({
        questions,
        why: why ?? '',
      }),
    }),
  };
}

export function maxActSteps(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8;
  return Math.min(MAX_ACT_STEPS, Math.max(1, Math.floor(n)));
}
