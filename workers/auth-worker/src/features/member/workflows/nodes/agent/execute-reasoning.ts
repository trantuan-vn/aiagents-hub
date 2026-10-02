import { generateText, stepCountIs, tool, type ToolSet } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { z } from 'zod';

import { gatewayForExecution, stampFromNode, withAiCapacityRetry } from '../../ai/workers-ai.js';
import {
  asBillingAiResponse,
  billAgentUsage,
  billGenerateTextCalls,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../billing/billing.js';
import { reportUsageCharge } from '../../billing/charge.js';
import {
  agentHasRagToolKind,
  buildAgentToolset,
  buildRagToolset,
  codeModeToolName,
} from '../../execution/agent-runtime.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import { attachSimpleMemory, isLinkedSimpleMemory } from '../memory-node/simple.js';
import { ragBillingFromNodeContext } from '../tool/shared/rag-context.js';
import { executeGetRag, prefetchLinkedGetRag, type PrefetchedRag } from '../tool/get-rag/execute.js';
import { filesFromWebhookBody, extractTextFromPdfFiles } from '../tool/save-rag/pdf-extract.js';
import type { NodeContext, NodeOutput } from '../types.js';
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
import {
  buildCitations,
  formatCitationBlock,
  formatRagContext,
  groundedTextOrFallback,
} from './reasoning/cite.js';
import {
  emptyFrame,
  inferMissingSlots,
  parseTaskFrame,
  shouldAskClarification,
  FRAME_PROMPT,
} from './reasoning/frame.js';
import {
  loadSessionMemory,
  persistSemanticEpisode,
  resolveSessionId,
  retrieveSemanticMemory,
  saveSessionMemory,
  memoryKey,
  type Episode,
} from './reasoning/memory.js';
import { normalizePlannerMode, parsePlan, shouldPlan, PLAN_PROMPT } from './reasoning/plan.js';
import { parseReflect, reflectHeuristics, REFLECT_PROMPT, SQL_REFLECT_PROMPT } from './reasoning/reflect.js';
import { parseLlmSafety, ruleClassify, SAFETY_CLASSIFIER_PROMPT } from './reasoning/safety.js';
import {
  buildAskUserTool,
  buildToolLoopGuidance,
  CODE_MODE_ACT_GUIDANCE,
  CODE_MODE_GROUNDED_GUIDANCE,
  codeModeSucceeded,
  decorateToolDescription,
  filterToolsForPolicy,
  initialToolChoice,
  maxActSteps,
  omitRetrieveTools,
  omitRetrieveWhenGrounded,
  partitionToolNames,
  validatedArtifactFromObservations,
  validatedSqlFromObservations,
} from './reasoning/tools.js';
import type {
  AgentCitation,
  AgentPlan,
  ReasoningOptions,
  ReasoningResult,
  SafetyCategory,
  TaskFrame,
  ToolObservation,
} from './reasoning/types.js';
import { ASK_USER_TOOL, DEFAULT_ACT_STEPS, RETRIEVE_MEMORY_TOOL } from './reasoning/types.js';
import {
  ASK_SYNTH_PROMPT,
  asksFromObservations,
  asksFromOutput,
  clipTrace,
  mostFrequentAsk,
  pushAsks,
  refusalSentence,
  runnableSqlStatement,
  sandboxErrorFromOutput,
} from './reasoning/ask-bag.js';
import { createLogger } from '../../../../../shared/logger.js';
import {
  DEFAULT_NO_IMPROVEMENT_LIMIT,
  DEFAULT_REFLECT_RETRIES,
  MAX_REFLECT_RETRIES,
  MIN_QUALITY_DELTA,
  draftsEquivalent,
  isSqlValidateToolName,
  latestSqlCheckOk,
  resolveEvaluationMode,
  scoreDraft,
  shouldStopImproving,
  type EvaluationMode,
} from './reasoning/quality.js';
import {
  acceptRewrittenQuestion,
  bareRetrievalQuestion,
  REWRITE_QUESTION_SYSTEM,
  rewriteQuestionUser,
  shouldRewriteForRetrieval,
} from './reasoning/rewrite-question.js';
import {
  hasGroundedSchema,
  isUngroundedRagText,
  oracleErrorFromObservations,
  oracleRetrieveQuery,
  sqlReflectUser,
} from './reasoning/sql-turn.js';
import {
  resolveConfiguredChoice,
  resolveConfiguredFlag,
  resolveConfiguredNumber,
  resolveConfiguredRaw,
} from '../tool/shared/pipeline.js';
import { toolClassForKind } from '../tool/shared/registry.js';

/** Validate tool names from the graph (survives Code Mode collapse). */
function linkedValidateToolNames(linkedTools: Array<Record<string, unknown>>): string[] {
  const names: string[] = [];
  for (const t of linkedTools) {
    const kind = String(t.kind ?? '');
    if (toolClassForKind(kind) !== 'validate') continue;
    const config = (t.config ?? {}) as Record<string, unknown>;
    names.push(String(config.toolName ?? kind.replace(/-/g, '_')).trim() || kind.replace(/-/g, '_'));
  }
  return names;
}

const TRACE_BODY_MAX = 2000;

/** Title plus the step body, so Observability's Message column shows the script, SQL, or error. */
function codeModeLogMessage(event: string, fields: Record<string, unknown>): string {
  const attempt = typeof fields.attempt === 'number' && fields.attempt > 0 ? ` #${fields.attempt}` : '';
  let title = `[Code Mode] ${event}`;
  if (event === 'code_mode.step') {
    const tool = typeof fields.tool === 'string' && fields.tool.trim() ? fields.tool.trim() : 'tool';
    title = `[Code Mode] step${attempt} · ${tool}`;
  } else if (event === 'code_mode.end') {
    const reason = typeof fields.reason === 'string' && fields.reason.trim() ? fields.reason.trim() : 'done';
    title = `[Code Mode] end · ${reason}`;
  } else if (event === 'code_mode.start') {
    const tool = typeof fields.toolChoice === 'string' ? fields.toolChoice.trim() : '';
    const where = tool && tool !== 'chat' ? tool : fields.mode === 'chat' ? 'chat' : 'code';
    title = `[Code Mode] start${attempt} · ${where}`;
  }
  const chunks: string[] = [];
  for (const key of ['query', 'input', 'output', 'logs', 'detail'] as const) {
    const value = fields[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    chunks.push(`${key}:\n${value.trim()}`);
  }
  return chunks.length ? `${title}\n${chunks.join('\n')}` : title;
}

function readableToolOutput(output: string): string {
  const text = output.trim();
  if (!text) return '';
  let parsed: unknown = text;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return clipTrace(text, TRACE_BODY_MAX);
    }
  }
  if (!parsed || typeof parsed !== 'object') return clipTrace(text, TRACE_BODY_MAX);
  const rec = parsed as Record<string, unknown>;
  const nested =
    rec.result && typeof rec.result === 'object' ? (rec.result as Record<string, unknown>) : rec;
  const sql = typeof nested.sql === 'string' ? nested.sql : typeof rec.sql === 'string' ? rec.sql : '';
  const error = sandboxErrorFromOutput(parsed);
  const asks = asksFromOutput(parsed);
  const lines = [
    sql ? `sql: ${sql}` : '',
    error ? `error: ${error}` : '',
    asks.length ? `ask: ${asks.join(' | ')}` : '',
  ].filter(Boolean);
  return clipTrace(lines.length ? lines.join('\n') : text, TRACE_BODY_MAX);
}

function sandboxLogsText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const logs = (payload as { logs?: unknown }).logs;
  if (!Array.isArray(logs) || !logs.length) return '';
  return logs.map((line) => (typeof line === 'string' ? line : asText(line))).join('\n');
}

export type ReasoningLlmCall = (args: {
  purpose: 'safety' | 'rewrite' | 'frame' | 'plan' | 'act' | 'reflect' | 'ask';
  system: string;
  user: string;
  tools?: ToolSet;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: 'auto' | 'required' | { type: 'tool'; toolName: string };
  stopSteps?: number;
}) => Promise<{
  text: string;
  usage?: unknown;
  observations: ToolObservation[];
  askedUser?: { questions: string[]; why?: string };
}>;

export function readReasoningOptions(
  data: Record<string, unknown>,
  input: Record<string, unknown> = {},
): ReasoningOptions {
  const retries = resolveConfiguredNumber(data.maxReflectRetries, input);
  const patience = resolveConfiguredNumber(data.noImprovementLimit, input);
  const mode = resolveConfiguredChoice(data.clarificationMode, input);
  const planner = resolveConfiguredRaw(data.enablePlanner ?? data.requirePlan, input);
  const safety = resolveConfiguredChoice(data.safetyLevel, input);
  return {
    clarificationMode: mode === 'best_effort' ? 'best_effort' : 'ask',
    requireCitations: resolveConfiguredFlag(data.requireCitations, input, true),
    maxReflectRetries:
      retries != null
        ? Math.min(MAX_REFLECT_RETRIES, Math.max(0, Math.floor(retries)))
        : DEFAULT_REFLECT_RETRIES,
    noImprovementLimit:
      patience != null
        ? Math.min(4, Math.max(1, Math.floor(patience)))
        : DEFAULT_NO_IMPROVEMENT_LIMIT,
    enablePlanner: normalizePlannerMode(planner ?? 'auto'),
    safetyLevel: safety === 'strict' ? 'strict' : 'standard',
    traceCodeMode: resolveConfiguredFlag(data.traceCodeMode, input, false),
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
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function snippetTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'text' in item) {
        return String((item as { text?: unknown }).text ?? '');
      }
      return asText(item);
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bill(
  ctx: NodeContext,
  service: Record<string, unknown>,
  endpoint: string,
  usage: unknown,
): Promise<void> {
  const charge = await billAgentUsage(
    ctx.c.env,
    ctx.bindingName,
    ctx.userDO,
    ctx.user.identifier,
    service,
    {
      endpoint,
      aiResponse: usage,
      userAgent: ctx.requestMeta?.userAgent,
      ipAddress: ctx.requestMeta?.ipAddress,
      workflowAttribution: ctx.attr,
      executionKey: ctx.executionKey,
    },
  );
  reportUsageCharge(ctx.onCost, charge);
}

function refusedResult(reason: string, category: SafetyCategory): ReasoningResult {
  return {
    status: 'refused',
    text: `I cannot help with that request. ${reason}`,
    citations: [],
    confidence: 1,
    reason,
    category,
  };
}

function clarificationResult(questions: string[], why: string, frame: TaskFrame): ReasoningResult {
  const unique = [...new Set(questions.map((q) => q.trim()).filter(Boolean))];
  const text = unique.length
    ? `I need a bit more information before I can continue:\n${unique.map((q) => `- ${q}`).join('\n')}`
    : 'I need more information before I can continue.';
  return {
    status: 'needs_clarification',
    text: why ? `${text}\n\n(${why})` : text,
    citations: [],
    questions: unique,
    confidence: frame.confidence,
    frame,
    reason: why || undefined,
  };
}

function presentForChat(
  result: ReasoningResult,
  userText: string,
  observations: ToolObservation[],
  evaluationMode: EvaluationMode,
): ReasoningResult {
  if (result.status === 'needs_clarification') {
    const questions = (result.questions ?? []).map((q) => q.trim()).filter(Boolean);
    if (questions.length === 1) return { ...result, text: questions[0], questions };
    return result;
  }
  if (result.status === 'refused') {
    return { ...result, text: refusalSentence(userText, result.reason ?? '') };
  }
  const validated = evaluationMode === 'sql' ? validatedSqlFromObservations(observations) : '';
  const raw = (validated || extractSql(result.text)).trim();
  const runnable = runnableSqlStatement(raw);
  const sql =
    runnable ||
    (/^(?:SELECT|WITH)\b/i.test(raw) ? (raw.endsWith(';') ? raw : `${raw};`) : '');
  if (!sql) return result;
  return { ...result, text: sql };
}

function toNodeOutput(
  result: ReasoningResult,
  extra: {
    query: string;
    snippets: string[];
    endpoint: string;
    evaluationMode?: EvaluationMode;
    validatedArtifact?: string;
    codeModeTrace?: Array<Record<string, unknown>>;
  },
): NodeOutput {
  const mode = extra.evaluationMode ?? 'generic';
  const validated = String(extra.validatedArtifact ?? '').trim();
  const fromText = extractSql(result.text);
  // SQL field: prefer validate-tool artifact in sql mode; otherwise only extract when present in the answer.
  const rawSql = mode === 'sql' ? validated || fromText : fromText;
  const runnable = runnableSqlStatement(rawSql);
  const sql = runnable || rawSql;
  const artifact = validated || (mode === 'sql' ? sql : '') || undefined;
  return {
    status: result.status,
    text: result.text,
    ...(artifact ? { artifact } : {}),
    sql,
    citations: result.citations,
    plan: result.plan,
    questions: result.questions,
    confidence: result.confidence,
    reason: result.reason,
    category: result.category,
    query: extra.query,
    snippets: extra.snippets,
    count: extra.snippets.length,
    endpoint: extra.endpoint,
    ...(extra.codeModeTrace?.length ? { codeModeTrace: extra.codeModeTrace } : {}),
  };
}

function createDefaultLlm(args: {
  ctx: NodeContext;
  modelId: string;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  onBill?: (usage: unknown, text: string) => Promise<void>;
}): ReasoningLlmCall {
  const { ctx, modelId, maxTokens, onBill } = args;
  return async (call) => {
    const limit = call.maxTokens ?? Math.min(maxTokens, call.purpose === 'act' ? maxTokens : 512);
    const temperature = call.temperature ?? args.temperature;
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
          maxOutputTokens: limit,
          temperature,
          topP: args.topP,
          frequencyPenalty: args.frequencyPenalty,
          presencePenalty: args.presencePenalty,
          tools: call.tools,
          toolChoice: call.toolChoice,
          stopWhen: stepCountIs(call.stopSteps ?? DEFAULT_ACT_STEPS),
          onStepFinish: async (step) => {
            billedSteps += 1;
            const usage = (step as { usage?: unknown }).usage;
            await onBill?.(usage, asText((step as { text?: unknown }).text));
          },
        }),
      );
      await billGenerateTextCalls(async (usage, text) => {
        await onBill?.(usage, text);
      }, result, billedSteps);
      const observations: ToolObservation[] = [];
      let askedUser: { questions: string[]; why?: string } | undefined;
      const steps = (result.steps ?? []) as Array<{
        toolCalls?: Array<{ toolName?: string; input?: unknown; args?: unknown }>;
        toolResults?: Array<{
          toolName?: string;
          result?: unknown;
          output?: unknown;
          input?: unknown;
          args?: unknown;
        }>;
      }>;
      for (const step of steps) {
        const calls = step.toolCalls ?? [];
        for (const [index, tr] of (step.toolResults ?? []).entries()) {
          const name = String(tr.toolName ?? '');
          const payload = tr.output !== undefined ? tr.output : tr.result;
          const call = calls[index];
          const inputRaw = tr.input ?? tr.args ?? call?.input ?? call?.args;
          const logs = sandboxLogsText(payload);
          observations.push({
            tool: name,
            ok: !(payload && typeof payload === 'object' && 'ok' in payload && (payload as { ok?: boolean }).ok === false),
            output: truncate(payload),
            ...(inputRaw == null ? {} : { input: truncate(inputRaw, 4000) }),
            ...(logs ? { logs: truncate(logs, TRACE_BODY_MAX) } : {}),
          });
          if (name === ASK_USER_TOOL && payload && typeof payload === 'object') {
            const rec = payload as { questions?: string[]; why?: string };
            askedUser = {
              questions: Array.isArray(rec.questions) ? rec.questions.map(String) : [],
              why: rec.why,
            };
          }
        }
      }
      return {
        text: asText(result.text),
        usage: result.totalUsage ?? result.usage,
        observations,
        askedUser,
      };
    }

    const messages = [
      ...(call.system ? [{ role: 'system', content: call.system }] : []),
      { role: 'user', content: call.user },
    ];
    const aiResponse = await runTextModel(ctx.c.env, modelId, messages, limit, {
      temperature,
      top_p: args.topP,
      frequency_penalty: args.frequencyPenalty,
      presence_penalty: args.presencePenalty,
    }, stampFromNode(ctx, 'text'));
    const text = asText(extractTextFromAiResponse(aiResponse));
    await onBill?.(aiResponse, text);
    return {
      text,
      usage: aiResponse,
      observations: [],
    };
  };
}

async function synthesizeAsk(args: {
  llm: ReasoningLlmCall;
  userText: string;
  asks: string[];
  why: string;
  lastError: string;
}): Promise<string> {
  const drafted = await args.llm({
    purpose: 'ask',
    system: ASK_SYNTH_PROMPT,
    user: `User:\n${args.userText}\n\nGaps:\n${args.asks.join('\n')}\n\nWhy: ${args.why}\n\nLast error: ${args.lastError}`,
    maxTokens: 200,
  });
  const parsed = parseJsonObject(drafted.text);
  const question = String(parsed?.question ?? '').trim();
  return question || mostFrequentAsk(args.asks);
}

async function refreshSqlRag(ctx: NodeContext, agentId: string, query: string): Promise<PrefetchedRag | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const result = await executeGetRag({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId,
      input: { query: trimmed },
      userDO: ctx.userDO,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
      billing: ragBillingFromNodeContext(ctx),
      triggerContext: (ctx.nodeInput ?? {}) as Record<string, unknown>,
      stamp: stampFromNode(ctx, 'embed'),
    });
    const snippets = result.snippets.map((snippet) => snippet.text).filter(Boolean);
    return { ragText: result.ragText, snippets, query: trimmed };
  } catch (error) {
    console.warn('[reasoning] get_rag refresh failed:', error);
    return null;
  }
}

function codeModeGroundedUser(original: string, normalized: string, ragText: string): string {
  return [
    `Question:\n${original}`,
    `Normalized question:\n${normalized || original}`,
    ragText.trim(),
    'Write SQL from this context, then call check_sql. Do not call get_rag.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function codeModeRepairUser(original: string, error: string): string {
  const query = oracleRetrieveQuery(error) || clipTrace(error, 240);
  return [
    `Question:\n${original}`,
    'Previous SQL failed.',
    `Error:\n${error.trim() || '(none)'}`,
    `Call get_rag with only this query:\n${query || '(none)'}`,
    'Then fix the previous SQL. Do not send the original question as the retrieve query.',
  ].join('\n\n');
}

async function runCodeModeAgent(args: {
  llm: ReasoningLlmCall;
  codeModeName: string;
  tool: ToolSet[string];
  userText: string;
  originalQuestion: string;
  normalizedQuestion: string;
  ragText: string;
  userSystem: string;
  sessionSummary: string;
  historyText: string;
  workflowDescription: string;
  maxReflectRetries: number;
  evaluationMode: EvaluationMode;
  trace: boolean;
  onTrace?: (event: string, fields: Record<string, unknown>) => void;
  emit: (result: ReasoningResult, observations: ToolObservation[]) => Promise<NodeOutput>;
}): Promise<NodeOutput> {
  const codeTool: ToolSet = { [args.codeModeName]: args.tool };
  const traceLog = args.trace && args.onTrace ? args.onTrace : null;
  const grounded = Boolean(args.ragText.trim());
  const system = [
    args.userSystem,
    grounded ? CODE_MODE_GROUNDED_GUIDANCE : CODE_MODE_ACT_GUIDANCE,
    args.workflowDescription ? `Workflow: ${args.workflowDescription}` : '',
    args.sessionSummary ? `Session memory:\n${args.sessionSummary}` : '',
    args.historyText ? `Previous conversation:\n${args.historyText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let observations: ToolObservation[] = [];
  let asks: string[] = [];
  let why = '';
  let lastError = '';

  const actOnce = async (attempt: 1 | 2, priorAsks: string[], priorError: string) => {
    const groundedUser =
      attempt === 1
        ? codeModeGroundedUser(args.originalQuestion || args.userText, args.normalizedQuestion, args.ragText)
        : codeModeRepairUser(args.originalQuestion || args.userText, priorError);
    const user =
      grounded
        ? groundedUser
        : attempt === 1
          ? args.userText
          : `${args.userText}\n\nPrevious script failed.\nError: ${priorError || '(none)'}\nCall get_rag first with this query:\n${priorAsks.join('\n') || priorError || args.userText}`;
    if (traceLog) {
      traceLog('code_mode.start', {
        attempt,
        query: clipTrace(user, TRACE_BODY_MAX),
        tools: args.codeModeName,
        toolChoice: args.codeModeName,
        stopSteps: 1,
      });
    }
    return args.llm({
      purpose: 'act',
      system,
      user,
      tools: codeTool,
      toolChoice: { type: 'tool', toolName: args.codeModeName },
      stopSteps: 1,
    });
  };

  const logSteps = (attempt: 1 | 2, stepObservations: ToolObservation[], fedToNextStep: boolean) => {
    if (!traceLog) return;
    for (const observation of stepObservations) {
      traceLog('code_mode.step', {
        attempt,
        tool: observation.tool,
        input: observation.input ? clipTrace(observation.input, TRACE_BODY_MAX) : '',
        output: readableToolOutput(String(observation.output ?? '')),
        logs: observation.logs ? clipTrace(observation.logs, TRACE_BODY_MAX) : '',
        fedToNextStep,
      });
    }
  };

  const endTrace = (reason: string, askCount: number, detail = '') => {
    traceLog?.('code_mode.end', {
      reason,
      askCount,
      detail: detail ? clipTrace(detail, TRACE_BODY_MAX) : '',
    });
  };

  const finishOk = async (draft: string, obs: ToolObservation[]) => {
    const artifact =
      args.evaluationMode === 'sql'
        ? validatedSqlFromObservations(obs)
        : validatedArtifactFromObservations(obs);
    let text = draft;
    if (artifact && !/```/.test(text)) {
      text =
        args.evaluationMode === 'sql' && /^(SELECT|WITH)\b/i.test(artifact)
          ? `\`\`\`sql\n${artifact}\n\`\`\``
          : artifact;
    }
    endTrace('artifact', asks.length, artifact || text);
    return args.emit(
      {
        status: 'ok',
        text,
        citations: [],
        confidence: 0.7,
      },
      obs,
    );
  };

  const first = await actOnce(1, [], '');
  const firstObs = first.observations ?? [];
  observations = firstObs;
  asks = pushAsks(asks, [
    ...asksFromObservations(firstObs),
    ...(first.askedUser?.questions ?? []),
  ]);
  why = first.askedUser?.why ?? why;
  lastError = firstObs.map((o) => sandboxErrorFromOutput(o.output)).find(Boolean) ?? '';
  const firstArtifact = codeModeSucceeded(firstObs);

  if (firstArtifact) {
    logSteps(1, firstObs, false);
    return finishOk(asText(first.text), observations);
  }

  if (args.maxReflectRetries <= 0) {
    logSteps(1, firstObs, false);
    if (asks.length) {
      const question = await synthesizeAsk({
        llm: args.llm,
        userText: args.userText,
        asks,
        why,
        lastError,
      });
      endTrace('ask_synthesized', asks.length, question);
      return args.emit(
        clarificationResult([question], why, emptyFrame(args.userText.slice(0, 240))),
        observations,
      );
    }
    endTrace('retries_disabled', 0, asText(first.text));
    return args.emit({ status: 'ok', text: asText(first.text), citations: [], confidence: 0.4 }, observations);
  }

  logSteps(1, firstObs, true);
  endTrace('ask_fed_to_rag', asks.length, asks.join('\n') || lastError);

  const second = await actOnce(2, asks, lastError);
  const secondObs = second.observations ?? [];
  observations = [...observations, ...secondObs];
  asks = pushAsks(asks, [
    ...asksFromObservations(secondObs),
    ...(second.askedUser?.questions ?? []),
  ]);
  why = second.askedUser?.why ?? why;
  lastError = secondObs.map((o) => sandboxErrorFromOutput(o.output)).find(Boolean) ?? lastError;
  logSteps(2, secondObs, false);

  if (codeModeSucceeded(secondObs)) {
    return finishOk(asText(second.text), observations);
  }
  if (asks.length) {
    const question = await synthesizeAsk({
      llm: args.llm,
      userText: args.userText,
      asks,
      why,
      lastError,
    });
    endTrace('ask_synthesized', asks.length, question);
    return args.emit(
      clarificationResult([question], why, emptyFrame(args.userText.slice(0, 240))),
      observations,
    );
  }
  endTrace('retry_exhausted', 0, asText(second.text) || lastError);
  return args.emit({ status: 'ok', text: asText(second.text), citations: [], confidence: 0.4 }, observations);
}

export async function executeReasoningAgent(
  ctx: NodeContext,
  deps?: { llm?: ReasoningLlmCall },
): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const linked = resolveAgentResources(ctx.definition, ctx.node.id, {
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  const linkedValidateNames = linkedValidateToolNames(linked.tools);
  const evaluationMode = resolveEvaluationMode(linkedValidateNames);
  let nodeInput = { ...(ctx.nodeInput ?? {}) } as Record<string, unknown>;
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

  const safetyIn = ruleClassify(userText);
  if (safetyIn.action === 'refuse') {
    const refused = refusedResult(safetyIn.reason, safetyIn.category);
    refused.text = refusalSentence(userText, safetyIn.reason);
    return toNodeOutput(refused, {
      query: userText,
      snippets: [],
      endpoint: String(linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '').trim(),
    });
  }

  const endpoint = String(
    linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '',
  ).trim();
  if (!deps?.llm && !endpoint) {
    throw new Error('Agent node missing serviceEndpoint (connect a service node or pick a service)');
  }

  let optionScope = { ...nodeInput, input: ctx.input ?? '' };
  let service: Record<string, unknown> = { id: 0, endpoint };
  let modelId = '@cf/meta/llama-3.1-8b-instruct';
  if (!deps?.llm) {
    await ensureWalletBalance(ctx.userDO, ctx.c.env);
    service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
    modelId = getModelForService(service);
    assertTextGenerationModel(modelId);
  }

  const llm =
    deps?.llm ??
    createDefaultLlm({
      ctx,
      modelId,
      maxTokens: resolveMaxTokens(data, linked.serviceOptions, modelId, optionScope),
      temperature: aiParamsFromServiceOptions(linked.serviceOptions).temperature as number | undefined,
      topP: aiParamsFromServiceOptions(linked.serviceOptions).top_p as number | undefined,
      frequencyPenalty: aiParamsFromServiceOptions(linked.serviceOptions).frequency_penalty as number | undefined,
      presencePenalty: aiParamsFromServiceOptions(linked.serviceOptions).presence_penalty as number | undefined,
      onBill: async (usage, text) => {
        await bill(ctx, service, endpoint, asBillingAiResponse(usage, text));
      },
    });

  if (safetyIn.action === 'review') {
    const classified = await llm({
      purpose: 'safety',
      system: SAFETY_CLASSIFIER_PROMPT,
      user: userText,
      maxTokens: 200,
    });
    const parsed = parseLlmSafety(classified.text);
    if (parsed.action === 'refuse') {
      const refused = refusedResult(parsed.reason, parsed.category);
      refused.text = refusalSentence(userText, parsed.reason);
      return toNodeOutput(refused, {
        query: userText,
        snippets: [],
        endpoint,
      });
    }
  }

  let retrievalQuery = question;
  if (evaluationMode === 'sql' && shouldRewriteForRetrieval(data.systemPrompt) && question) {
    const source = bareRetrievalQuestion(question) || question;
    try {
      const rewritten = await llm({
        purpose: 'rewrite',
        system: REWRITE_QUESTION_SYSTEM,
        user: rewriteQuestionUser(question, String(data.systemPrompt ?? '')),
        maxTokens: isReasoningModel(modelId) ? 2048 : 512,
        temperature: 0,
      });
      retrievalQuery = acceptRewrittenQuestion(rewritten.text, source);
    } catch (error) {
      console.warn('[reasoning] question rewrite failed:', error);
      retrievalQuery = source;
    }
  }

  const prefetched = await prefetchLinkedGetRag(
    { ...ctx, nodeInput },
    ctx.node.id,
    question || userText,
    retrievalQuery !== question ? retrievalQuery : '',
  );
  if (prefetched.ragText && !isUngroundedRagText(prefetched.ragText)) {
    const priorQuery = typeof nodeInput.query === 'string' ? nodeInput.query.trim() : '';
    const bare = bareRetrievalQuestion(question) || question;
    nodeInput = {
      ...nodeInput,
      ragText: prefetched.ragText,
      snippets: prefetched.snippets,
      query: priorQuery || (evaluationMode === 'sql' ? bare : prefetched.query),
    };
    userText = resolveAgentUserText(data, nodeInput, bare);
    if (pdfSuffix && !userText.includes(pdfSuffix)) userText = `${userText}\n\n${pdfSuffix}`;
  }

  optionScope = { ...nodeInput, input: ctx.input ?? '' };
  const options = readReasoningOptions(data, optionScope);
  const citationsRequired = evaluationMode === 'sql' ? false : options.requireCitations;
  const agentScope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: ctx.input ?? '' };
  const userSystem = interpolateTemplate(String(data.systemPrompt ?? ''), agentScope);

  const sessionId = resolveSessionId(nodeInput, String(ctx.runContext.sessionId ?? ''));
  const session = sessionId
    ? await loadSessionMemory(ctx.userDO, memoryKey(ctx.meta.workflowId, sessionId, ctx.node.id))
    : { memoryKey: '', summary: '', episodes: [] as Episode[] };

  const memoryCollection = isLinkedSimpleMemory(linked)
    ? ''
    : String(data.memoryCollection ?? linked.memoryCollection ?? '').trim();
  const memoryNamespace = String(linked.memoryNamespace ?? '').trim() || undefined;
  const simpleMemory = await attachSimpleMemory(ctx, linked, userText);
  const ragSnippets = snippetTexts(nodeInput.snippets);
  const semantic =
    memoryCollection && !agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-rag')
      ? await retrieveSemanticMemory(
          ctx.c.env,
          memoryCollection,
          userText,
          4,
          memoryNamespace,
          stampFromNode(ctx, 'embed'),
        )
      : [];
  let snippets = [...new Set([...ragSnippets, ...semantic].map((s) => s.trim()).filter(Boolean))];

  const embedModel = resolveEmbedModel(service);
  const billing = ragBillingFromNodeContext(ctx);
  const ragTools = buildRagToolset(
    {
      env: ctx.c.env,
      userDO: ctx.userDO,
      agentId: ctx.node.id,
      triggerContext: nodeInput,
      embedModel,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
      billing,
      aiCall: {
        executionKey: String(ctx.executionKey ?? ''),
        workflowId: String(ctx.meta.workflowId ?? ''),
        nodeId: ctx.node.id,
      },
    },
    ctx.definition,
    ctx.node.id,
  );
  const httpTools = buildAgentToolset({ env: ctx.c.env, userDO: ctx.userDO }, ctx.definition);
  const memoryTool: ToolSet =
    memoryCollection && !Object.keys(ragTools).length
      ? {
          [RETRIEVE_MEMORY_TOOL]: tool({
            description: decorateToolDescription(
              RETRIEVE_MEMORY_TOOL,
              'Search long-term memory / knowledge base for relevant context.',
            ),
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }: { query: string }) => {
              const found = await retrieveSemanticMemory(
                ctx.c.env,
                memoryCollection,
                query,
                5,
                memoryNamespace,
                stampFromNode(ctx, 'embed'),
              );
              return { snippets: found, count: found.length };
            },
          }),
        }
      : {};

  const baseTools: ToolSet = omitRetrieveWhenGrounded(
    { ...httpTools, ...ragTools, ...memoryTool, ...buildAskUserTool() },
    snippets.length > 0,
  );
  const partitionedPreview = partitionToolNames(Object.keys(baseTools));
  for (const [name, def] of Object.entries(baseTools)) {
    const description = String((def as { description?: string }).description ?? '');
    (def as { description?: string }).description = decorateToolDescription(name, description, {
      retrieve: partitionedPreview.retrieve,
      validate: partitionedPreview.validate,
    });
  }

  const codeModeName = codeModeToolName(baseTools);
  const usingCodeMode = Boolean(codeModeName);
  const traceRows: Array<Record<string, unknown>> = [];
  const recordTrace = (event: string, fields: Record<string, unknown>) => {
    if (!options.traceCodeMode) return;
    const message = codeModeLogMessage(event, fields);
    const row = { message, event, ...fields };
    traceRows.push(row);
    createLogger('auth-worker', 'reasoning-agent').info(event, row);
  };

  const emit = async (
    result: ReasoningResult,
    observations: ToolObservation[],
    mode: EvaluationMode = evaluationMode,
  ): Promise<NodeOutput> => {
    let shown = presentForChat(result, userText, observations, mode);
    if (shown.status === 'ok') {
      const outputSafety = ruleClassify(shown.text);
      if (outputSafety.action === 'refuse') {
        shown = presentForChat(refusedResult(outputSafety.reason, outputSafety.category), userText, observations, mode);
      }
    }
    const outputExtra = {
      query: userText,
      snippets,
      endpoint,
      evaluationMode: mode,
      validatedArtifact:
        mode === 'sql'
          ? validatedSqlFromObservations(observations)
          : validatedArtifactFromObservations(observations),
      codeModeTrace: traceRows.slice(),
    };
    if (shown.status === 'refused') {
      return toNodeOutput(shown, outputExtra);
    }
    if (shown.status === 'needs_clarification') {
      if (sessionId) {
        await saveSessionMemory(ctx.userDO, {
          workflowId: ctx.meta.workflowId,
          sessionId,
          agentId: ctx.node.id,
          summary: `Asked: ${(shown.questions ?? []).join('; ') || shown.text}`.slice(0, 240),
          status: shown.status,
        });
      }
      await simpleMemory.persist((shown.questions ?? [shown.text]).join('\n'));
      return toNodeOutput(shown, outputExtra);
    }
    if (sessionId) {
      await saveSessionMemory(ctx.userDO, {
        workflowId: ctx.meta.workflowId,
        sessionId,
        agentId: ctx.node.id,
        summary: shown.text.slice(0, 240),
        status: shown.status,
      });
    }
    if (memoryCollection) {
      await persistSemanticEpisode(
        ctx.c.env,
        memoryCollection,
        shown.text.slice(0, 400),
        memoryNamespace,
        stampFromNode(ctx, 'embed'),
      );
    }
    await simpleMemory.persist(shown.text);
    return toNodeOutput(shown, outputExtra);
  };

  if (usingCodeMode && codeModeName) {
    const codeTool = baseTools[codeModeName];
    if (codeTool) {
      return runCodeModeAgent({
        llm,
        codeModeName,
        tool: codeTool,
        userText,
        originalQuestion: question || userText,
        normalizedQuestion: retrievalQuery || question || userText,
        ragText: String(nodeInput.ragText ?? '').trim(),
        userSystem,
        sessionSummary: session.summary,
        historyText: simpleMemory.historyText,
        workflowDescription: String(ctx.meta.workflowDescription ?? ''),
        maxReflectRetries: options.maxReflectRetries,
        evaluationMode,
        trace: options.traceCodeMode,
        onTrace: recordTrace,
        emit: (result, observations) => emit(result, observations, evaluationMode),
      });
    }
  }

  const toolNames = Object.keys(baseTools);
  recordTrace('code_mode.start', {
    attempt: 0,
    mode: 'chat',
    reason: 'not_collapsed',
    query: clipTrace(userText, TRACE_BODY_MAX),
    tools: toolNames.join(','),
    toolChoice: 'chat',
    stopSteps: 0,
  });
  let frame: TaskFrame = {
    ...emptyFrame(userText.slice(0, 240)),
    missingSlots: inferMissingSlots(userText, {
      hasTools: toolNames.some((n) => n !== ASK_USER_TOOL),
      hasMemorySnippets: snippets.length > 0,
      sessionSummary: session.summary,
    }),
    canUseTools: toolNames.some((n) => n !== ASK_USER_TOOL),
    knownFacts: snippets.slice(0, 3),
    confidence: snippets.length ? 0.7 : 0.4,
  };

  const ragTextNow = String(nodeInput.ragText ?? '').trim();
  if (options.clarificationMode === 'ask' && !frame.missingSlots.length && !hasGroundedSchema(ragTextNow, snippets)) {
    const framed = await llm({
      purpose: 'frame',
      system: FRAME_PROMPT,
      user: `User: ${userText}\nTools: ${toolNames.join(', ') || 'none'}\nSession: ${session.summary || '(empty)'}\nSnippets: ${snippets.slice(0, 3).join(' | ') || '(none)'}`,
      maxTokens: 300,
    });
    const parsed = parseTaskFrame(parseJsonObject(framed.text), frame.goal);
    frame = {
      ...parsed,
      canUseTools: parsed.canUseTools || frame.canUseTools,
      knownFacts: parsed.knownFacts.length ? parsed.knownFacts : frame.knownFacts,
    };
  }

  if (shouldAskClarification(frame, options.clarificationMode)) {
    const questions = frame.missingSlots.map((slot) => `Please provide: ${slot}`);
    const result = clarificationResult(questions, 'Required details are missing and no tool can fill them.', frame);
    recordTrace('code_mode.end', { reason: 'clarification', askCount: questions.length, mode: 'chat' });
    return emit(result, []);
  }

  let plan: AgentPlan | undefined;
  if (shouldPlan({ enablePlanner: options.enablePlanner, toolCount: toolNames.length, userText })) {
    const planned = await llm({
      purpose: 'plan',
      system: PLAN_PROMPT,
      user: `Goal: ${frame.goal}\nUser: ${userText}\nTools: ${toolNames.join(', ') || 'none'}`,
      maxTokens: 400,
    });
    plan = parsePlan(parseJsonObject(planned.text));
  }

  const policyTools = filterToolsForPolicy(baseTools, { plan, safetyLevel: options.safetyLevel });
  const policyNames = Object.keys(policyTools);
  const partitioned = partitionToolNames(policyNames);
  const hasRetrieve = partitioned.retrieve.length > 0;
  const sqlContextReady = () =>
    evaluationMode === 'sql' && hasGroundedSchema(String(nodeInput.ragText ?? ''), snippets);
  const actSystem = (names: string[]) => {
    const ragContext = formatRagContext(String(nodeInput.ragText ?? '').trim() || snippets);
    const guidance = buildToolLoopGuidance({
      usingCodeMode: false,
      retrieve: partitioned.retrieve,
      validate: partitioned.validate.length ? partitioned.validate : linkedValidateNames,
      grounded: sqlContextReady(),
    });
    const citationSeed = buildCitations({ snippets, observations: [], sessionSummary: session.summary });
    return [
      userSystem || 'You are a helpful assistant that uses tools when they improve accuracy.',
      ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
      names.length
        ? `You can call these tools when helpful: ${names.join(', ')}. Call a tool instead of guessing when it can fetch the answer. Call ${ASK_USER_TOOL} if required details are missing.`
        : `If you lack required details, say so and ask. Do not guess.`,
      guidance,
      session.summary ? `Session memory:\n${session.summary}` : '',
      simpleMemory.historyText ? `Previous conversation:\n${simpleMemory.historyText}` : '',
      ragContext
        ? citationsRequired
          ? `Retrieved knowledge (cite as [n]):\n${ragContext}`
          : `Retrieved context:\n${ragContext}`
        : '',
      citationsRequired && citationSeed.length
        ? 'Every factual claim must include [n] citations that match the source list.'
        : '',
      plan?.steps.length
        ? `Plan:\n${plan.steps.map((s) => `${s.id}. ${s.action}${s.tool ? ` [${s.tool}]` : ''}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  let draft = '';
  let lastIssues = '';
  let observations: ToolObservation[] = [];
  const configuredActSteps = resolveConfiguredNumber(data.maxActSteps, optionScope);
  const stopSteps = maxActSteps(configuredActSteps ?? DEFAULT_ACT_STEPS);
  let bestText = '';
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCitations: AgentCitation[] = [];
  let stagnant = 0;
  let askBag: string[] = [];
  let askWhy = '';

  const finish = async (text: string, cites: AgentCitation[]) => {
    return emit(
      {
        status: 'ok',
        text: citationsRequired ? groundedTextOrFallback(text, cites) : text,
        citations: cites,
        plan: plan?.steps,
        confidence: frame.confidence,
        frame,
      },
      observations,
    );
  };

  const endChatTrace = (reason: string) => {
    recordTrace('code_mode.end', { reason, askCount: askBag.length, mode: 'chat' });
  };

  const clarifyFromAsks = async () => {
    const question = await synthesizeAsk({
      llm,
      userText,
      asks: askBag,
      why: askWhy,
      lastError: lastIssues,
    });
    const result = clarificationResult([question], askWhy, frame);
    result.plan = plan?.steps;
    result.text = question;
    result.questions = [question];
    return emit(result, observations);
  };

  for (let attempt = 0; attempt <= options.maxReflectRetries; attempt += 1) {
    const groundedSql = sqlContextReady();
    const actTools = groundedSql ? omitRetrieveTools(policyTools) : policyTools;
    const actNames = Object.keys(actTools);
    const retrieveFocus =
      !groundedSql && askBag.length
        ? `\n\nCall the retrieve tool first with this query:\n${askBag.join('\n')}`
        : '';
    const act = await llm({
      purpose: 'act',
      system: actSystem(actNames),
      user:
        attempt === 0
          ? `${userText}${retrieveFocus}`
          : `${userText}\n\nRevise the previous draft:\n${draft}\nIssues: ${lastIssues}\nImprove the answer. Stop if you cannot do better than the draft.${citationsRequired ? '\nKeep citations as [n].' : ''}${retrieveFocus}`,
      tools: actNames.length ? actTools : undefined,
      toolChoice: actNames.length
        ? initialToolChoice(actNames, plan, snippets.length > 0 || groundedSql)
        : undefined,
      stopSteps,
    });
    observations = [...observations, ...(act.observations ?? [])];
    const fresh = act.observations ?? [];
    if (fresh.length) {
      for (const observation of fresh) {
        recordTrace('code_mode.step', {
          attempt: attempt + 1,
          mode: 'chat',
          tool: observation.tool,
          output: readableToolOutput(String(observation.output ?? '')),
          input: observation.input ? clipTrace(observation.input, TRACE_BODY_MAX) : '',
          logs: observation.logs ? clipTrace(observation.logs, TRACE_BODY_MAX) : '',
          fedToNextStep: true,
        });
      }
    } else {
      recordTrace('code_mode.step', {
        attempt: attempt + 1,
        mode: 'chat',
        tool: '(model)',
        output: clipTrace(asText(act.text), TRACE_BODY_MAX),
        fedToNextStep: false,
      });
    }
    if (act.askedUser?.questions?.length) {
      if (!hasRetrieve) {
        const result = clarificationResult(act.askedUser.questions, act.askedUser.why ?? '', frame);
        result.plan = plan?.steps;
        endChatTrace('ask_synthesized');
        return emit(result, observations);
      }
      askBag = pushAsks(askBag, act.askedUser.questions);
      askWhy = act.askedUser.why ?? askWhy;
    }
    draft = asText(act.text);

    if (evaluationMode === 'sql' && latestSqlCheckOk(observations)) {
      const citations = buildCitations({ snippets, observations, sessionSummary: session.summary });
      bestText = draft || bestText;
      bestCitations = citations;
      endChatTrace('chat');
      return finish(bestText || draft, citations);
    }

    if (evaluationMode === 'sql' && fresh.some((observation) => isSqlValidateToolName(observation.tool) && !observation.ok)) {
      const query = oracleRetrieveQuery(oracleErrorFromObservations(fresh));
      const replaced = await refreshSqlRag(ctx, ctx.node.id, query);
      if (replaced) {
        nodeInput = {
          ...nodeInput,
          ragText: replaced.ragText,
          snippets: replaced.snippets,
          query: replaced.query,
        };
        snippets = replaced.snippets;
      }
    }

    const citations = buildCitations({
      snippets,
      observations,
      sessionSummary: session.summary,
    });
    const heuristic = reflectHeuristics({
      text: draft,
      citations,
      observations,
      frame,
      requireCitations: citationsRequired,
      userText,
      snippets,
      mode: evaluationMode,
    });
    const quality = scoreDraft({
      text: draft,
      issues: heuristic.issues,
      citations,
      observations,
      snippets,
      userText,
      mode: evaluationMode,
    });
    if (quality > bestScore + MIN_QUALITY_DELTA && !draftsEquivalent(draft, bestText)) {
      bestScore = quality;
      bestText = draft;
      bestCitations = citations;
      stagnant = 0;
    } else {
      stagnant += 1;
    }

    const stop = shouldStopImproving({
      pass: heuristic.pass,
      score: Math.max(quality, bestScore),
      bestScore,
      stagnant,
      patience: options.noImprovementLimit,
      isLastAttempt: attempt === options.maxReflectRetries,
    });
    if (stop) {
      if (!heuristic.pass && askBag.length) {
        endChatTrace('ask_synthesized');
        return clarifyFromAsks();
      }
      endChatTrace('chat');
      return finish(bestText || draft, bestCitations.length ? bestCitations : citations);
    }

    const critique = await llm({
      purpose: 'reflect',
      system: evaluationMode === 'sql' ? SQL_REFLECT_PROMPT : REFLECT_PROMPT,
      user:
        evaluationMode === 'sql'
          ? sqlReflectUser(draft, oracleErrorFromObservations(observations))
          : `Draft:\n${draft}\nSources:\n${formatCitationBlock(citations)}\nTool results:\n${observations.map((o) => `${o.tool}: ${o.output}`).join('\n')}`,
      maxTokens: 800,
    });
    const parsed = parseReflect(parseJsonObject(critique.text), heuristic);
    lastIssues = parsed.issues.join(', ');
    if (parsed.rewritten) {
      draft = parsed.rewritten;
      const rewrittenCitations = buildCitations({ snippets, observations, sessionSummary: session.summary });
      const rewrittenHeuristic = reflectHeuristics({
        text: draft,
        citations: rewrittenCitations,
        observations,
        frame,
        requireCitations: citationsRequired,
        userText,
        snippets,
        mode: evaluationMode,
      });
      const rewrittenScore = scoreDraft({
        text: draft,
        issues: rewrittenHeuristic.issues,
        citations: rewrittenCitations,
        observations,
        snippets,
        userText,
        mode: evaluationMode,
      });
      if (rewrittenScore > bestScore + MIN_QUALITY_DELTA) {
        bestScore = rewrittenScore;
        bestText = draft;
        bestCitations = rewrittenCitations;
        stagnant = 0;
      }
      if (
        shouldStopImproving({
          pass: rewrittenHeuristic.pass,
          score: Math.max(rewrittenScore, bestScore),
          bestScore,
          stagnant,
          patience: options.noImprovementLimit,
          isLastAttempt: attempt === options.maxReflectRetries,
        })
      ) {
        if (!rewrittenHeuristic.pass && askBag.length) {
          endChatTrace('ask_synthesized');
          return clarifyFromAsks();
        }
        endChatTrace('chat');
        return finish(bestText || draft, bestCitations.length ? bestCitations : rewrittenCitations);
      }
    }
  }

  if (askBag.length) {
    endChatTrace('ask_synthesized');
    return clarifyFromAsks();
  }
  endChatTrace('chat');
  return finish(bestText || draft, bestCitations);
}
