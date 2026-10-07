import { REASONING_AGENT_DEFAULTS } from '@aiagents-hub/workflow-nodes';
import { generateText, stepCountIs, tool, type ToolSet } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { z } from 'zod';

import { createLogger } from '../../../../../shared/logger.js';
import { gatewayForExecution, stampFromNode, withAiCapacityRetry } from '../../ai/workers-ai.js';
import {
  asBillingAiResponse,
  billAgentUsage,
  billGenerateTextCalls,
  ensureWalletBalance,
  extractTextFromAiResponse,
  finishReasonFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../billing/billing.js';
import { reportUsageCharge } from '../../billing/charge.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import {
  agentHasRagToolKind,
  buildAgentToolset,
  buildLinkedAgentTools,
} from '../../execution/agent-runtime.js';
import { attachSimpleMemory, isLinkedSimpleMemory } from '../memory-node/simple.js';
import { executeCheckSql, type CheckSqlResult } from '../tool/check-sql/execute.js';
import { executeGetRag, prefetchLinkedGetRag, type PrefetchedRag } from '../tool/get-rag/execute.js';
import { extractTextFromPdfFiles, filesFromWebhookBody } from '../tool/save-rag/pdf-extract.js';
import {
  resolveConfiguredChoice,
  resolveConfiguredFlag,
  resolveConfiguredNumber,
} from '../tool/shared/pipeline.js';
import { ragBillingFromNodeContext, toolNodeConfig } from '../tool/shared/rag-context.js';
import { toolClassForKind } from '../tool/shared/registry.js';
import type { NodeContext, NodeOutput } from '../types.js';
import { buildCitations, formatRagContext, groundedTextOrFallback } from './reasoning/cite.js';
import {
  loadSessionMemory,
  memoryKey,
  resolveSessionId,
  retrieveSemanticMemory,
  saveSessionMemory,
} from './reasoning/memory.js';
import {
  ASK_QUESTION_PROMPT,
  askQuestionUser,
  clipTrace,
  defaultClarifyingQuestion,
  refusalSentence,
  runnableSqlStatement,
} from './reasoning/present.js';
import {
  acceptRewrittenQuestion,
  bareRetrievalQuestion,
  REWRITE_QUESTION_SYSTEM,
  rewriteQuestionUser,
  shouldRewriteForRetrieval,
} from './reasoning/rewrite-question.js';
import { parseLlmSafety, ruleClassify, SAFETY_CLASSIFIER_PROMPT } from './reasoning/safety.js';
import {
  isSqlValidateToolName,
  isUngroundedRagText,
  isValidatorConfigError,
  mergeSchemaContext,
  needsSchemaRefresh,
  oracleRetrieveQuery,
  parseSqlReply,
  sqlRepairSuffix,
  sqlSystemPrompt,
  withRetrievedContext,
} from './reasoning/sql.js';
import {
  buildAskUserTool,
  filterToolsForSafety,
  maxActSteps,
  omitRetrieveWhenGrounded,
} from './reasoning/tools.js';
import {
  ASK_USER_TOOL,
  DEFAULT_ACT_STEPS,
  MAX_REPAIRS,
  RETRIEVE_MEMORY_TOOL,
  type ReasoningOptions,
  type ReasoningResult,
  type SafetyCategory,
  type ToolObservation,
} from './reasoning/types.js';
import {
  aiParamsFromServiceOptions,
  assertTextGenerationModel,
  extractSql,
  interpolateTemplate,
  isReasoningModel,
  parseJsonObject,
  resolveAgentUserText,
  resolveEmbedModel,
  resolveMaxTokens,
} from './shared.js';

/**
 * Reasoning Agent.
 *
 * Text-to-SQL (a `check-sql` tool is linked) runs a host-driven loop:
 *   retrieve schema → model writes one SELECT → validator runs it →
 *   on error: re-retrieve by the failing identifier, model repairs → …
 * The model never picks tools; the host does. One LLM call per attempt.
 *
 * Any other toolset runs one tool-calling turn (`generateText` with tools)
 * plus `ask_user` for clarification.
 */

export type ReasoningLlmCall = (args: {
  purpose: 'safety' | 'rewrite' | 'sql' | 'ask' | 'act';
  system: string;
  user: string;
  tools?: ToolSet;
  maxTokens?: number;
  temperature?: number;
  stopSteps?: number;
}) => Promise<{
  text: string;
  usage?: unknown;
  observations?: ToolObservation[];
  askedUser?: { questions: string[]; why?: string };
}>;

export type ReasoningDeps = {
  llm?: ReasoningLlmCall;
  /** Validator override (tests). Defaults to the linked Check SQL tool. */
  checkSql?: (sql: string) => Promise<CheckSqlResult>;
  /** Schema lookup override (tests). Defaults to the linked Get RAG tool. */
  retrieve?: (query: string) => Promise<PrefetchedRag | null>;
};

const TRACE_CLIP = 400;

export function readReasoningOptions(
  data: Record<string, unknown>,
  input: Record<string, unknown> = {},
): ReasoningOptions {
  const repairs = resolveConfiguredNumber(data.maxReflectRetries, input);
  const steps = resolveConfiguredNumber(data.maxActSteps, input);
  const mode = resolveConfiguredChoice(data.clarificationMode, input);
  const safety = resolveConfiguredChoice(data.safetyLevel, input);
  return {
    clarificationMode: mode === 'best_effort' ? 'best_effort' : 'ask',
    requireCitations: resolveConfiguredFlag(data.requireCitations, input, true),
    maxRepairs:
      repairs != null
        ? Math.min(MAX_REPAIRS, Math.max(0, Math.floor(repairs)))
        : REASONING_AGENT_DEFAULTS.maxReflectRetries,
    maxActSteps: maxActSteps(steps ?? DEFAULT_ACT_STEPS),
    safetyLevel: safety === 'strict' ? 'strict' : 'standard',
    trace: resolveConfiguredFlag(data.traceCodeMode, input, false),
  };
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(value: unknown, max = 1500): string {
  const text = asText(value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((s) => s.trim()).filter(Boolean))];
}

function snippetTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'text' in item
        ? String((item as { text?: unknown }).text ?? '')
        : asText(item),
  );
}

function refused(userText: string, reason: string, category: SafetyCategory): ReasoningResult {
  return {
    status: 'refused',
    text: refusalSentence(userText, reason),
    citations: [],
    confidence: 1,
    reason,
    category,
  };
}

function clarification(question: string, reason = ''): ReasoningResult {
  const text = question.trim();
  return {
    status: 'needs_clarification',
    text,
    citations: [],
    questions: [text],
    confidence: 0.3,
    reason: reason || undefined,
  };
}

type Trace = {
  rows: Array<Record<string, unknown>>;
  push: (event: string, fields: Record<string, unknown>) => void;
};

function createTrace(enabled: boolean): Trace {
  const rows: Array<Record<string, unknown>> = [];
  if (!enabled) return { rows, push: () => undefined };
  const log = createLogger('auth-worker', 'reasoning-agent');
  return {
    rows,
    push(event, fields) {
      const row: Record<string, unknown> = { event };
      for (const [key, value] of Object.entries(fields)) {
        row[key] = typeof value === 'string' ? clipTrace(value, TRACE_CLIP) : value;
      }
      rows.push(row);
      log.info(event, row);
    },
  };
}

const OUTPUT_TOKEN_FLOOR = 8192;
const OUTPUT_TOKEN_CAP = 32768;

/** Next output budget after finish_reason length. Stays put once the cap is reached. */
export function raisedOutputTokenLimit(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return OUTPUT_TOKEN_FLOOR;
  if (current >= OUTPUT_TOKEN_CAP) return current;
  return Math.min(OUTPUT_TOKEN_CAP, Math.max(current * 2, OUTPUT_TOKEN_FLOOR));
}

function createDefaultLlm(args: {
  ctx: NodeContext;
  modelId: string;
  maxTokens: number;
  params: Record<string, unknown>;
  onBill: (usage: unknown, text: string) => Promise<void>;
}): ReasoningLlmCall {
  const { ctx, modelId, maxTokens, params, onBill } = args;
  const temperature = params.temperature as number | undefined;
  return async (call) => {
    const limit = call.maxTokens ?? maxTokens;
    const complete = async (outputLimit: number) => {
      if (call.purpose === 'act' && call.tools && Object.keys(call.tools).length && ctx.c.env.AI) {
        const workersAI = createWorkersAI({
          binding: ctx.c.env.AI,
          gateway: gatewayForExecution(stampFromNode(ctx, 'agent')),
        });
        let billedSteps = 0;
        const result = await withAiCapacityRetry(async () =>
          generateText({
            model: workersAI(modelId as never),
            system: call.system,
            messages: [{ role: 'user', content: call.user }],
            maxOutputTokens: outputLimit,
            temperature: call.temperature ?? temperature,
            topP: params.top_p as number | undefined,
            frequencyPenalty: params.frequency_penalty as number | undefined,
            presencePenalty: params.presence_penalty as number | undefined,
            tools: call.tools,
            stopWhen: stepCountIs(call.stopSteps ?? DEFAULT_ACT_STEPS),
            onStepFinish: async (step) => {
              billedSteps += 1;
              await onBill((step as { usage?: unknown }).usage, asText((step as { text?: unknown }).text));
            },
          }),
        );
        await billGenerateTextCalls(onBill, result, billedSteps);

        const observations: ToolObservation[] = [];
        let askedUser: { questions: string[]; why?: string } | undefined;
        const steps = (result.steps ?? []) as Array<{
          finishReason?: string;
          toolCalls?: Array<{ input?: unknown; args?: unknown }>;
          toolResults?: Array<{ toolName?: string; result?: unknown; output?: unknown }>;
        }>;
        for (const step of steps) {
          for (const [index, tr] of (step.toolResults ?? []).entries()) {
            const name = String(tr.toolName ?? '');
            const payload = tr.output !== undefined ? tr.output : tr.result;
            const input = step.toolCalls?.[index];
            observations.push({
              tool: name,
              ok: !(payload && typeof payload === 'object' && (payload as { ok?: unknown }).ok === false),
              output: truncate(payload),
              ...(input ? { input: truncate(input.input ?? input.args, 2000) } : {}),
            });
            if (name === ASK_USER_TOOL && payload && typeof payload === 'object') {
              const rec = payload as { questions?: unknown; why?: unknown };
              askedUser = {
                questions: Array.isArray(rec.questions) ? rec.questions.map(String) : [],
                why: typeof rec.why === 'string' ? rec.why : undefined,
              };
            }
          }
        }
        const finish = result.finishReason || steps[steps.length - 1]?.finishReason || '';
        return {
          text: asText(result.text),
          usage: result.totalUsage ?? result.usage,
          observations,
          askedUser,
          cutOff: finish === 'length',
        };
      }

      const messages = [
        ...(call.system ? [{ role: 'system', content: call.system }] : []),
        { role: 'user', content: call.user },
      ];
      const aiResponse = await runTextModel(
        ctx.c.env,
        modelId,
        messages,
        outputLimit,
        { ...params, ...(call.temperature != null ? { temperature: call.temperature } : {}) },
        stampFromNode(ctx, 'text'),
      );
      const text = asText(extractTextFromAiResponse(aiResponse));
      await onBill(aiResponse, text);
      return {
        text,
        usage: aiResponse,
        observations: [] as ToolObservation[],
        cutOff: finishReasonFromAiResponse(aiResponse) === 'length',
      };
    };

    const first = await complete(limit);
    if (!first.cutOff) return first;
    const raised = raisedOutputTokenLimit(limit);
    if (raised <= limit) return first;
    console.warn(`[reasoning] ${call.purpose} hit max_tokens ${limit}; retrying at ${raised}`);
    return complete(raised);
  };
}

function toNodeOutput(
  result: ReasoningResult,
  extra: { query: string; snippets: string[]; endpoint: string; trace: Array<Record<string, unknown>> },
): NodeOutput {
  const sql = result.sql ?? (runnableSqlStatement(extractSql(result.text)) || extractSql(result.text));
  return {
    status: result.status,
    text: result.text,
    sql,
    ...(result.validated != null ? { validated: result.validated } : {}),
    ...(result.columns ? { columns: result.columns } : {}),
    ...(result.rowCount != null ? { rowCount: result.rowCount } : {}),
    ...(result.attempts != null ? { attempts: result.attempts } : {}),
    citations: result.citations,
    questions: result.questions,
    confidence: result.confidence,
    reason: result.reason,
    category: result.category,
    query: extra.query,
    snippets: extra.snippets,
    count: extra.snippets.length,
    endpoint: extra.endpoint,
    ...(extra.trace.length ? { trace: extra.trace } : {}),
  };
}

function linkedToolName(t: Record<string, unknown>): string {
  const kind = String(t.kind ?? '');
  const config = (t.config ?? {}) as Record<string, unknown>;
  return String(config.toolName ?? kind.replace(/-/g, '_')).trim() || kind.replace(/-/g, '_');
}

function hasSqlValidator(linkedTools: Array<Record<string, unknown>>): boolean {
  return linkedTools.some(
    (t) => toolClassForKind(String(t.kind ?? '')) === 'validate' && isSqlValidateToolName(linkedToolName(t)),
  );
}

/** Template scope for the system prompt: never inline retrieved schema there. */
function systemPromptScope(nodeInput: Record<string, unknown>, input: string): Record<string, unknown> {
  const source = { ...nodeInput, ragText: '', snippets: [] };
  return { ...source, $json: source, json: source, input };
}

async function refreshSqlRag(ctx: NodeContext, query: string): Promise<PrefetchedRag | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const result = await executeGetRag({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId: ctx.node.id,
      input: { query: trimmed },
      userDO: ctx.userDO,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
      billing: ragBillingFromNodeContext(ctx),
      triggerContext: (ctx.nodeInput ?? {}) as Record<string, unknown>,
      stamp: stampFromNode(ctx, 'embed'),
    });
    return { ragText: result.ragText, snippets: result.snippets.map((s) => s.text).filter(Boolean), query: trimmed };
  } catch (error) {
    console.warn('[reasoning] get_rag refresh failed:', error);
    return null;
  }
}

type Shared = {
  ctx: NodeContext;
  data: Record<string, unknown>;
  nodeInput: Record<string, unknown>;
  llm: ReasoningLlmCall;
  modelId: string;
  options: ReasoningOptions;
  userText: string;
  question: string;
  pdfSuffix: string;
  userSystem: string;
  sessionSummary: string;
  historyText: string;
  trace: Trace;
  emit: (result: ReasoningResult, snippets: string[]) => Promise<NodeOutput>;
};

async function runSqlPipeline(s: Shared, deps: ReasoningDeps): Promise<NodeOutput> {
  const { ctx, data, llm, options, trace } = s;
  const bare = bareRetrievalQuestion(s.question) || s.question;

  // 1. Retrieval query: optional rewrite that adds domain vocabulary from the system prompt.
  let retrievalQuery = bare;
  if (bare && shouldRewriteForRetrieval(data.systemPrompt)) {
    try {
      const rewritten = await llm({
        purpose: 'rewrite',
        system: REWRITE_QUESTION_SYSTEM,
        user: rewriteQuestionUser(bare, String(data.systemPrompt ?? '')),
        maxTokens: isReasoningModel(s.modelId) ? 2048 : 512,
        temperature: 0,
      });
      retrievalQuery = acceptRewrittenQuestion(rewritten.text, bare);
    } catch (error) {
      console.warn('[reasoning] question rewrite failed:', error);
    }
  }

  // 2. Schema linking: host retrieves; the model never calls get_rag.
  const prefetched = await prefetchLinkedGetRag(
    { ...ctx, nodeInput: s.nodeInput },
    ctx.node.id,
    bare,
    retrievalQuery !== bare ? retrievalQuery : '',
  );
  let ragText = isUngroundedRagText(prefetched.ragText) ? '' : prefetched.ragText;
  let snippets = dedupe(prefetched.snippets);
  trace.push('sql.retrieve', { query: retrievalQuery, chars: ragText.length, grounded: Boolean(ragText) });

  const system = sqlSystemPrompt({
    userSystem: s.userSystem,
    clarificationMode: options.clarificationMode,
    workflowDescription: String(ctx.meta.workflowDescription ?? ''),
    sessionSummary: s.sessionSummary,
    historyText: s.historyText,
  });
  const checkSqlConfig = toolNodeConfig(ctx.definition, ctx.node.id, 'check-sql') ?? {};
  const checkSql =
    deps.checkSql ??
    ((sql: string) =>
      executeCheckSql({ env: ctx.c.env, sql, triggerContext: s.nodeInput, toolConfig: checkSqlConfig }));
  const retrieve = deps.retrieve ?? ((query: string) => refreshSqlRag(ctx, query));

  // 3. Generate → execute → repair.
  let lastSql = '';
  let lastError = '';
  const attempts = options.maxRepairs + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const scoped = { ...s.nodeInput, ragText, snippets, query: bare };
    let body = resolveAgentUserText(data, scoped, bare);
    if (s.pdfSuffix && !body.includes(s.pdfSuffix)) body = `${body}\n\n${s.pdfSuffix}`;
    const user = withRetrievedContext(body, ragText) + (attempt > 1 ? sqlRepairSuffix(lastSql, lastError) : '');

    const reply = await llm({ purpose: 'sql', system, user });
    const parsed = parseSqlReply(reply.text);
    trace.push('sql.generate', { attempt, sql: parsed.sql, ask: parsed.ask });

    if (!parsed.sql) {
      if (parsed.ask && options.clarificationMode === 'ask') {
        trace.push('sql.end', { reason: 'model_asked', attempts: attempt });
        return s.emit(clarification(parsed.ask), snippets);
      }
      lastError = parsed.ask ? `Model asked instead of writing SQL: ${parsed.ask}` : 'Reply contained no SELECT or WITH statement.';
      continue;
    }

    lastSql = parsed.sql;
    const check = await checkSql(parsed.sql);
    trace.push('sql.validate', { attempt, ok: check.ok, error: check.ok ? '' : check.error });
    if (check.ok) {
      const sql = runnableSqlStatement(check.sql || parsed.sql) || `${check.sql || parsed.sql};`;
      trace.push('sql.end', { reason: 'validated', attempts: attempt });
      return s.emit(
        {
          status: 'ok',
          text: sql,
          sql,
          validated: true,
          columns: check.columns,
          rowCount: check.rowCount,
          citations: [],
          confidence: 0.9,
          attempts: attempt,
        },
        snippets,
      );
    }
    if (isValidatorConfigError(check.error)) throw new Error(check.error);
    lastError = check.error;

    if (attempt < attempts && needsSchemaRefresh(check.error)) {
      const query = oracleRetrieveQuery(check.error);
      const refreshed = await retrieve(query);
      if (refreshed?.ragText && !isUngroundedRagText(refreshed.ragText)) {
        ragText = mergeSchemaContext(ragText, refreshed.ragText);
        snippets = dedupe([...snippets, ...refreshed.snippets]);
      }
      trace.push('sql.retrieve', { query, chars: ragText.length, grounded: Boolean(refreshed?.ragText) });
    }
  }

  // 4. Out of repairs. best_effort still asks when there is no draft to hand back.
  if (options.clarificationMode === 'ask' || !lastSql) {
    let question = '';
    try {
      const asked = await llm({
        purpose: 'ask',
        system: ASK_QUESTION_PROMPT,
        user: askQuestionUser({ userText: bare, lastSql, lastError }),
        maxTokens: 200,
      });
      question = String(parseJsonObject(asked.text)?.question ?? '').trim();
    } catch (error) {
      console.warn('[reasoning] ask synthesis failed:', error);
    }
    trace.push('sql.end', { reason: 'repairs_exhausted', attempts });
    return s.emit(clarification(question || defaultClarifyingQuestion(bare), lastError), snippets);
  }
  trace.push('sql.end', { reason: 'best_effort', attempts });
  const draft = runnableSqlStatement(lastSql) || lastSql;
  return s.emit(
    {
      status: 'ok',
      text: draft,
      sql: draft,
      validated: false,
      citations: [],
      confidence: 0.3,
      reason: lastError || undefined,
      attempts,
    },
    snippets,
  );
}

async function runToolChat(s: Shared, linked: ReturnType<typeof resolveAgentResources>, service: Record<string, unknown>): Promise<NodeOutput> {
  const { ctx, llm, options, trace } = s;

  const memoryCollection = isLinkedSimpleMemory(linked)
    ? ''
    : String(s.data.memoryCollection ?? linked.memoryCollection ?? '').trim();
  const memoryNamespace = String(linked.memoryNamespace ?? '').trim() || undefined;
  const hasGetRag = agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-rag');

  const prefetched = await prefetchLinkedGetRag({ ...ctx, nodeInput: s.nodeInput }, ctx.node.id, s.question);
  const semantic =
    memoryCollection && !hasGetRag
      ? await retrieveSemanticMemory(ctx.c.env, memoryCollection, s.question, 4, memoryNamespace, stampFromNode(ctx, 'embed'))
      : [];
  const ragText = isUngroundedRagText(prefetched.ragText) ? '' : prefetched.ragText.trim();
  const snippets = dedupe([...prefetched.snippets, ...snippetTexts(s.nodeInput.snippets), ...semantic]);
  const grounded = Boolean(ragText) || snippets.length > 0;

  const linkedTools = buildLinkedAgentTools(
    {
      env: ctx.c.env,
      userDO: ctx.userDO,
      agentId: ctx.node.id,
      triggerContext: s.nodeInput,
      embedModel: resolveEmbedModel(service),
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
      billing: ragBillingFromNodeContext(ctx),
      aiCall: {
        executionKey: String(ctx.executionKey ?? ''),
        workflowId: String(ctx.meta.workflowId ?? ''),
        nodeId: ctx.node.id,
      },
    },
    ctx.definition,
    ctx.node.id,
    { collapseCodeMode: false },
  );
  const httpTools = buildAgentToolset({ env: ctx.c.env, userDO: ctx.userDO }, ctx.definition);
  const memoryTool: ToolSet =
    memoryCollection && !Object.keys(linkedTools).length
      ? {
          [RETRIEVE_MEMORY_TOOL]: tool({
            description: 'Search long-term memory / knowledge base for relevant context.',
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }: { query: string }) => {
              const found = await retrieveSemanticMemory(ctx.c.env, memoryCollection, query, 5, memoryNamespace, stampFromNode(ctx, 'embed'));
              return { snippets: found, count: found.length };
            },
          }),
        }
      : {};
  const tools = filterToolsForSafety(
    {
      ...omitRetrieveWhenGrounded({ ...httpTools, ...linkedTools, ...memoryTool }, grounded),
      ...(options.clarificationMode === 'ask' ? buildAskUserTool() : {}),
    },
    options.safetyLevel,
  );
  const toolNames = Object.keys(tools);
  const citationsRequired = options.requireCitations && grounded;

  const system = [
    s.userSystem || 'You are a helpful assistant that uses tools when they improve accuracy.',
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.${
          toolNames.includes(ASK_USER_TOOL) ? ` Call ${ASK_USER_TOOL} only when required details are missing and no tool can fill them.` : ''
        }`
      : 'If you lack required details, say so. Do not guess.',
    citationsRequired ? 'Every factual claim must include [n] citations that match the retrieved context.' : '',
    s.sessionSummary ? `Session memory:\n${s.sessionSummary}` : '',
    s.historyText ? `Previous conversation:\n${s.historyText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const user = withRetrievedContext(s.userText, formatRagContext(ragText || snippets));

  trace.push('chat.act', { tools: toolNames.join(','), grounded, steps: options.maxActSteps });
  const act = await llm({
    purpose: 'act',
    system,
    user,
    tools: toolNames.length ? tools : undefined,
    stopSteps: options.maxActSteps,
  });
  const observations = act.observations ?? [];
  for (const o of observations) trace.push('chat.tool', { tool: o.tool, ok: o.ok, output: o.output });

  const asked = act.askedUser?.questions?.map((q) => q.trim()).filter(Boolean) ?? [];
  if (asked.length && options.clarificationMode === 'ask') {
    trace.push('chat.end', { reason: 'model_asked' });
    return s.emit(clarification(asked.join(' '), act.askedUser?.why ?? ''), snippets);
  }

  const citations = buildCitations({ snippets, observations, sessionSummary: s.sessionSummary });
  const text = citationsRequired ? groundedTextOrFallback(asText(act.text), citations) : asText(act.text);
  trace.push('chat.end', { reason: 'answered' });
  return s.emit({ status: 'ok', text, citations, confidence: grounded ? 0.7 : 0.5 }, snippets);
}

export async function executeReasoningAgent(ctx: NodeContext, deps: ReasoningDeps = {}): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const linked = resolveAgentResources(ctx.definition, ctx.node.id, {
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  const endpoint = String(linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '').trim();
  const nodeInput = { ...(ctx.nodeInput ?? {}) } as Record<string, unknown>;
  const optionScope = { ...nodeInput, input: ctx.input ?? '' };
  const options = readReasoningOptions(data, optionScope);
  const trace = createTrace(options.trace);

  let userText = resolveAgentUserText(data, nodeInput, ctx.input);
  const question = userText.trim();
  let pdfSuffix = '';
  const pdfFiles = filesFromWebhookBody(nodeInput.body ?? ctx.nodeInput);
  if (pdfFiles.length) {
    const extracted = await extractTextFromPdfFiles(ctx.c.env, pdfFiles);
    if (extracted.length) {
      pdfSuffix = `Extracted PDF text:\n${extracted.map((f) => `--- ${f.filename} ---\n${f.text}`).join('\n\n')}`;
      userText = `${userText}\n\n${pdfSuffix}`;
    }
  }

  const output = (result: ReasoningResult, snippets: string[] = []) =>
    toNodeOutput(result, { query: question, snippets, endpoint, trace: trace.rows });

  // Input screen: no LLM, no memory write.
  const safetyIn = ruleClassify(userText);
  if (safetyIn.action === 'refuse') return output(refused(userText, safetyIn.reason, safetyIn.category));

  if (!deps.llm && !endpoint) {
    throw new Error('Agent node missing serviceEndpoint (connect a service node or pick a service)');
  }
  let service: Record<string, unknown> = { id: 0, endpoint };
  let modelId = '@cf/meta/llama-3.1-8b-instruct';
  if (!deps.llm) {
    await ensureWalletBalance(ctx.userDO, ctx.c.env);
    service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
    modelId = getModelForService(service);
    assertTextGenerationModel(modelId);
  }
  const llm =
    deps.llm ??
    createDefaultLlm({
      ctx,
      modelId,
      maxTokens: resolveMaxTokens(data, linked.serviceOptions, modelId, optionScope),
      params: aiParamsFromServiceOptions(linked.serviceOptions),
      onBill: async (usage, text) => {
        const charge = await billAgentUsage(ctx.c.env, ctx.bindingName, ctx.userDO, ctx.user.identifier, service, {
          endpoint,
          aiResponse: asBillingAiResponse(usage, text),
          userAgent: ctx.requestMeta?.userAgent,
          ipAddress: ctx.requestMeta?.ipAddress,
          workflowAttribution: ctx.attr,
          executionKey: ctx.executionKey,
        });
        reportUsageCharge(ctx.onCost, charge);
      },
    });

  if (safetyIn.action === 'review') {
    const classified = await llm({ purpose: 'safety', system: SAFETY_CLASSIFIER_PROMPT, user: userText, maxTokens: 200 });
    const parsed = parseLlmSafety(classified.text);
    if (parsed.action === 'refuse') return output(refused(userText, parsed.reason, parsed.category));
  }

  // Memory: session summary (always) and simple memory history (when a memory node is linked).
  const sessionId = resolveSessionId(nodeInput, String(ctx.runContext.sessionId ?? ''));
  const session = sessionId
    ? await loadSessionMemory(ctx.userDO, memoryKey(ctx.meta.workflowId, sessionId, ctx.node.id))
    : { memoryKey: '', summary: '', episodes: [] };
  const simpleMemory = await attachSimpleMemory(ctx, linked, userText);
  const userSystem = interpolateTemplate(String(data.systemPrompt ?? ''), systemPromptScope(nodeInput, String(ctx.input ?? '')));

  const emit = async (result: ReasoningResult, snippets: string[]): Promise<NodeOutput> => {
    let shown = result;
    if (shown.status === 'ok') {
      const screen = ruleClassify(shown.text);
      if (screen.action === 'refuse') shown = refused(userText, screen.reason, screen.category);
    }
    if (shown.status !== 'refused') {
      if (sessionId) {
        await saveSessionMemory(ctx.userDO, {
          workflowId: ctx.meta.workflowId,
          sessionId,
          agentId: ctx.node.id,
          summary: (shown.status === 'needs_clarification' ? `Asked: ${shown.text}` : shown.text).slice(0, 240),
          status: shown.status,
        });
      }
      await simpleMemory.persist(shown.text);
    }
    return output(shown, snippets);
  };

  const shared: Shared = {
    ctx,
    data,
    nodeInput,
    llm,
    modelId,
    options,
    userText,
    question,
    pdfSuffix,
    userSystem,
    sessionSummary: session.summary,
    historyText: simpleMemory.historyText,
    trace,
    emit,
  };

  if (!question && options.clarificationMode === 'ask') {
    return emit(clarification('What would you like me to do?', 'The request is empty.'), []);
  }
  if (hasSqlValidator(linked.tools)) return runSqlPipeline(shared, deps);
  return runToolChat(shared, linked, service);
}
