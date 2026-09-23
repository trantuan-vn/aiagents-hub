import { DynamicWorkerExecutor } from '@cloudflare/codemode';
import { createCodeTool } from '@cloudflare/codemode/ai';
import type { Tool, ToolSet } from 'ai';

function buildCodeModeDescription(args: {
  retrieveNames: string[];
  validateNames: string[];
}): string {
  const retrieve = args.retrieveNames.join(', ') || 'retrieve tools';
  const validate = args.validateNames.join(', ') || 'validate tools';
  const firstRetrieve = args.retrieveNames[0] ?? 'retrieve';
  const firstValidate = args.validateNames[0] ?? 'validate';
  return `Write a short JavaScript async arrow function that orchestrates linked tools.

Available APIs:
{{types}}

Rules:
- Call ${retrieve} first to load context for the user question.
- Draft an answer using only facts from those results. Never invent identifiers.
- Call ${validate} to verify. If ok is false: call ${retrieve} again focused on the error, rewrite, ${validate} again (max 3 attempts).
- Return { ok: true, ...artifact } only when ${validate} returns ok: true. Otherwise return { ok: false, error }.
- Do NOT use TypeScript syntax. Do NOT fetch the network. Only call the APIs listed above.

Example shape:
async () => {
  const question = "…";
  let ctx = await codemode.${firstRetrieve}({ query: question });
  let draft = "…"; // from ctx only
  for (let i = 0; i < 3; i++) {
    const check = await codemode.${firstValidate}({ /* draft fields */ });
    if (check.ok) return { ok: true, ...check };
    ctx = await codemode.${firstRetrieve}({ query: String(check.error ?? draft) });
  }
  return { ok: false, error: "${firstValidate} did not succeed" };
}`;
}

const MAX_RESULT_CHARS = 6000;
const MAX_CODE_CHARS = 24_000;

function truncateValue(value: unknown, max = MAX_RESULT_CHARS): unknown {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text || text.length <= max) return value;
    return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
  } catch {
    return String(value).slice(0, max);
  }
}

export type CreateCodeModeToolArgs = {
  env: Env;
  innerTools: ToolSet;
  toolName?: string;
  description?: string;
  timeoutMs?: number;
  retrieveNames?: string[];
  validateNames?: string[];
};

/** Wrap linked retrieve/validate tools as one Code Mode tool the outer model writes JS for. */
export function createCodeModeOuterTool(args: CreateCodeModeToolArgs): {
  name: string;
  tool: Tool;
} {
  const loader = args.env.LOADER;
  if (!loader) {
    throw new Error('Code Mode requires the LOADER worker_loaders binding');
  }

  const timeoutRaw = Number(args.timeoutMs);
  const timeout =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? Math.min(120_000, Math.max(5_000, Math.floor(timeoutRaw)))
      : 60_000;

  const executor = new DynamicWorkerExecutor({
    loader,
    timeout,
    globalOutbound: null,
  });

  const description =
    String(args.description ?? '').trim() ||
    buildCodeModeDescription({
      retrieveNames: args.retrieveNames ?? [],
      validateNames: args.validateNames ?? [],
    });
  const base = createCodeTool({
    tools: args.innerTools,
    executor,
    description,
  });

  const name = String(args.toolName ?? 'codemode').trim() || 'codemode';

  return {
    name,
    tool: {
      ...base,
      execute: async (input: { code?: string }, opts) => {
        const code = String(input?.code ?? '');
        if (!code.trim()) {
          return { result: { ok: false, error: 'empty code' }, logs: [] };
        }
        if (code.length > MAX_CODE_CHARS) {
          return {
            result: { ok: false, error: `code exceeds ${MAX_CODE_CHARS} characters` },
            logs: [],
          };
        }
        const execute = base.execute;
        if (typeof execute !== 'function') {
          return { result: { ok: false, error: 'codemode tool missing execute' }, logs: [] };
        }
        const raw = await execute({ code }, opts);
        const nested =
          raw && typeof raw === 'object' && 'result' in (raw as object)
            ? (raw as { result?: unknown }).result
            : raw;
        const nestedOk =
          nested && typeof nested === 'object' && 'ok' in (nested as object)
            ? (nested as { ok?: boolean }).ok !== false
            : true;
        return {
          ok: nestedOk,
          result: truncateValue(nested),
          logs: Array.isArray((raw as { logs?: unknown })?.logs)
            ? ((raw as { logs: unknown[] }).logs as unknown[])
                .slice(0, 40)
                .map((line) => truncateValue(line, 500))
            : undefined,
        };
      },
    } as Tool,
  };
}

export { buildCodeModeDescription };
