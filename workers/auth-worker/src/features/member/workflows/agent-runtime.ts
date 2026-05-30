import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import { resolveCredential } from './credentials.js';
import type { WorkflowDefinition } from './domain.js';
import { runHttpRequest } from './node-runtime.js';

/**
 * Builds the AI SDK toolset + RAG context for a workflow's conversational agent.
 *
 * Tools are derived from the workflow's own `http_request` nodes that are
 * flagged as `data.asTool === true`. This turns any integration the user wired
 * into a callable function the agent can invoke during a chat (real
 * tool-calling), while reusing the same SSRF-guarded HTTP runtime + credential
 * vault used by the executor.
 */

interface AgentToolContext {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
}

function sanitizeToolName(raw: string, fallback: string): string {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return name || fallback;
}

/** Extract `{{ args.<field> }}` placeholders so we can describe tool inputs. */
function collectArgFields(...templates: unknown[]): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*args\.([a-zA-Z0-9_]+)/g;
  for (const t of templates) {
    if (typeof t !== 'string') continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) set.add(m[1]);
  }
  return [...set];
}

function truncate(value: unknown, max = 4000): unknown {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text && text.length > max) {
    return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
  }
  return value;
}

export function buildAgentToolset(
  ctx: AgentToolContext,
  definition: WorkflowDefinition,
): ToolSet {
  const tools: ToolSet = {};
  const httpNodes = definition.nodes.filter(
    (n) => n.type === 'http_request' && (n.data as Record<string, unknown>)?.asTool === true,
  );

  httpNodes.forEach((node, index) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const name = sanitizeToolName(
      String(data.toolName ?? data.label ?? node.id ?? ''),
      `http_tool_${index + 1}`,
    );
    const fields = collectArgFields(data.url, data.body, ...Object.values(data.headers ?? {}));
    const description =
      String(data.toolDescription ?? data.description ?? '') ||
      `Calls ${String(data.method ?? 'GET')} ${String(data.url ?? '')}.` +
        (fields.length ? ` Provide args: ${fields.join(', ')}.` : '');

    tools[name] = tool({
      description,
      inputSchema: z.object({
        args: z
          .record(z.string(), z.any())
          .optional()
          .describe(
            fields.length
              ? `Values for: ${fields.join(', ')}`
              : 'Optional arguments referenced by the request template',
          ),
      }),
      execute: async ({ args }: { args?: Record<string, unknown> }) => {
        const credentialKey = String(data.credentialId ?? data.credentialKey ?? '');
        const credential = credentialKey
          ? await resolveCredential(ctx.userDO, ctx.env, credentialKey)
          : null;
        const scope = { args: args ?? {} };
        try {
          const result = await runHttpRequest(data, scope, credential);
          return { ok: result.ok, status: result.status, data: truncate(result.data) };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  });

  return tools;
}

/** Retrieve top-K snippets from a Vectorize collection for RAG grounding. */
export async function retrieveMemory(
  env: Env,
  collection: string,
  query: string,
  topK = 5,
): Promise<string[]> {
  const fallback = (env as unknown as Record<string, unknown>).VECTORIZE as
    | { query: (vector: number[], opts: { topK: number }) => Promise<{ matches?: { metadata?: Record<string, string> }[] }> }
    | undefined;
  const index =
    ((env as unknown as Record<string, unknown>)[collection] as typeof fallback) ?? fallback;
  if (!index?.query || !query.trim()) return [];
  try {
    const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query });
    const vector = (embed as { data?: number[][] })?.data?.[0];
    if (!vector?.length) return [];
    const result = await index.query(vector, { topK });
    return (result.matches ?? [])
      .map((m) => m.metadata?.text ?? m.metadata?.content ?? '')
      .filter(Boolean);
  } catch (e) {
    console.warn('[agent-runtime] memory retrieval failed:', e);
    return [];
  }
}

/** A RAG retrieval tool the agent can call on demand. */
export function buildMemoryTool(env: Env, collection: string): ToolSet {
  return {
    retrieve_memory: tool({
      description:
        'Search long-term memory / knowledge base for relevant context. Call this before answering questions that may rely on stored knowledge.',
      inputSchema: z.object({
        query: z.string().describe('The search query to find relevant memory snippets'),
      }),
      execute: async ({ query }: { query: string }) => {
        const snippets = await retrieveMemory(env, collection, query);
        return { snippets, count: snippets.length };
      },
    }),
  };
}
