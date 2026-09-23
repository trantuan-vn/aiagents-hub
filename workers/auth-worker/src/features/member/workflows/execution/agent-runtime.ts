import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { resolveCredential } from '../storage/credentials.js';
import type { WorkflowDefinition } from '../domain/domain.js';
import { resolveAgentResources } from '../engine/graph-helpers.js';
import {
  embedText,
  matchesToSnippets,
  queryCollection,
} from '../rag/index.js';
import type { RagBilling } from '../nodes/tool/shared/rag-context.js';
import { getToolModule } from '../nodes/tool/shared/registry.js';
import { createCodeModeOuterTool } from '../nodes/tool/code/create.js';
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
  agentId?: string;
  triggerContext?: Record<string, unknown>;
  embedModel?: string;
  ownerId?: string;
  workflowId?: number;
  billing?: RagBilling;
}

/** Fold any linked retrieve/validate tool into Code Mode (not only get-rag/check-sql). */
export function isCodeModeInnerLinkedKind(kind: string): boolean {
  const cls = getToolModule(kind)?.toolClass;
  return cls === 'retrieve' || cls === 'validate';
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

export function agentHasRagToolKind(definition: WorkflowDefinition, agentId: string, kind: string): boolean {
  const linked = resolveAgentResources(definition, agentId);
  return linked.tools.some((t) => String(t.kind ?? '') === kind);
}

function linkedToolName(t: Record<string, unknown>, kind: string): string {
  const config = (t.config ?? {}) as Record<string, unknown>;
  return sanitizeToolName(
    String(config.toolName ?? kind.replace(/-/g, '_')),
    kind.replace(/-/g, '_'),
  );
}

/**
 * When a `code` tool is linked with get-rag + check-sql, expose only Code Mode
 * to the outer model; siblings run inside the sandbox via RPC.
 */
export function collapseToCodeModeTool(
  tools: ToolSet,
  linkedTools: Array<Record<string, unknown>>,
  ctx: AgentToolContext,
): ToolSet {
  const codeNodes = linkedTools.filter((t) => String(t.kind ?? '') === 'code');
  if (!codeNodes.length) return tools;
  if (!ctx.env.LOADER) {
    console.warn('[agent-runtime] Code Mode linked but LOADER binding is missing — keeping individual tools');
    return tools;
  }

  const inner: ToolSet = {};
  const removeNames: string[] = [];
  const retrieveNames: string[] = [];
  const validateNames: string[] = [];

  for (const t of linkedTools) {
    const kind = String(t.kind ?? '');
    if (!isCodeModeInnerLinkedKind(kind)) continue;
    const name = linkedToolName(t, kind);
    const def = tools[name];
    if (!def) continue;
    inner[name] = def;
    removeNames.push(name);
    const cls = getToolModule(kind)?.toolClass;
    if (cls === 'retrieve') retrieveNames.push(name);
    if (cls === 'validate') validateNames.push(name);
  }

  if (!retrieveNames.length || !validateNames.length || Object.keys(inner).length < 2) {
    return tools;
  }

  const codeNode = codeNodes[0]!;
  const config = (codeNode.config ?? {}) as Record<string, unknown>;
  const toolName = sanitizeToolName(
    String(config.toolName ?? 'codemode'),
    'codemode',
  );
  const timeoutMs = Number(config.timeoutMs ?? config.timeout ?? 60_000);

  try {
    const created = createCodeModeOuterTool({
      env: ctx.env,
      innerTools: inner,
      toolName,
      description: String(config.toolDescription ?? config.description ?? '').trim() || undefined,
      timeoutMs,
      retrieveNames,
      validateNames,
    });
    const out: ToolSet = { ...tools };
    for (const name of removeNames) delete out[name];
    out[created.name] = created.tool;
    return out;
  } catch (e) {
    console.warn('[agent-runtime] Code Mode collapse failed:', e);
    return tools;
  }
}

export function codeModeToolName(tools: ToolSet): string | undefined {
  for (const name of Object.keys(tools)) {
    if (/^codemode$/i.test(name) || /code_mode/i.test(name)) return name;
  }
  return undefined;
}

/** Build AI SDK tools from linked tool_node modules (registry-driven). */
export function buildLinkedAgentTools(
  ctx: AgentToolContext,
  definition: WorkflowDefinition,
  agentId: string,
  options?: { collapseCodeMode?: boolean },
): ToolSet {
  const tools: ToolSet = {};
  const linked = resolveAgentResources(definition, agentId);
  const triggerContext = ctx.triggerContext ?? {};

  for (const t of linked.tools) {
    const kind = String(t.kind ?? '');
    if (kind === 'code') continue;
    const mod = getToolModule(kind);
    if (!mod?.createAgentTool) continue;

    const config = (t.config ?? {}) as Record<string, unknown>;
    const toolName = sanitizeToolName(
      String(config.toolName ?? kind.replace(/-/g, '_')),
      kind.replace(/-/g, '_'),
    );
    const toolDescription = String(
      config.toolDescription ?? config.description ?? `Tool: ${kind}`,
    );

    const created = mod.createAgentTool({
      env: ctx.env,
      userDO: ctx.userDO,
      definition,
      agentId,
      triggerContext,
      embedModel: ctx.embedModel,
      ownerId: ctx.ownerId,
      workflowId: ctx.workflowId,
      billing: ctx.billing,
      toolId: String(t.id ?? ''),
      toolConfig: config,
      toolName,
      toolDescription,
    });
    if (created) tools[created.name] = created.tool;
  }

  if (options?.collapseCodeMode === false) return tools;
  return collapseToCodeModeTool(tools, linked.tools, ctx);
}

/** @deprecated Prefer buildLinkedAgentTools — same implementation. */
export const buildRagToolset = buildLinkedAgentTools;

/** Retrieve top-K snippets from a Vectorize collection for RAG grounding. */
export async function retrieveMemory(
  env: Env,
  collection: string,
  query: string,
  topK = 5,
  namespace?: string,
): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    const vector = await embedText(env, query);
    if (!vector.length) return [];
    const matches = await queryCollection(env, collection, vector, { topK, namespace });
    return matchesToSnippets(matches);
  } catch (e) {
    console.warn('[agent-runtime] memory retrieval failed:', e);
    return [];
  }
}

/** A RAG retrieval tool the agent can call on demand. */
export function buildMemoryTool(env: Env, collection: string, namespace?: string): ToolSet {
  return {
    retrieve_memory: tool({
      description:
        'Search long-term memory / knowledge base for relevant context. Call this before answering questions that may rely on stored knowledge.',
      inputSchema: z.object({
        query: z.string().describe('The search query to find relevant memory snippets'),
      }),
      execute: async ({ query }: { query: string }) => {
        const snippets = await retrieveMemory(env, collection, query, 5, namespace);
        return { snippets, count: snippets.length };
      },
    }),
  };
}
