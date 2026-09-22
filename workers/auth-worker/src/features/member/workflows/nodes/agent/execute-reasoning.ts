import { generateText, stepCountIs, tool, type ToolSet } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { z } from 'zod';

import { withAiCapacityRetry, WORKERS_AI_GATEWAY } from '../../ai/workers-ai.js';
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
} from '../../execution/agent-runtime.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import { attachSimpleMemory, isLinkedSimpleMemory } from '../memory-node/simple.js';
import { ragBillingFromNodeContext } from '../tool/shared/rag-context.js';
import { prefetchLinkedGetRag } from '../tool/get-rag/execute.js';
import { filesFromWebhookBody, extractTextFromPdfFiles } from '../tool/save-rag/pdf-extract.js';
import type { NodeContext, NodeOutput } from '../types.js';
import {
  aiParamsFromServiceOptions,
  assertTextGenerationModel,
  extractSql,
  interpolateTemplate,
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
} from './reasoning/memory.js';
import { normalizePlannerMode, parsePlan, shouldPlan, PLAN_PROMPT } from './reasoning/plan.js';
import { parseReflect, reflectHeuristics, REFLECT_PROMPT } from './reasoning/reflect.js';
import { parseLlmSafety, ruleClassify, SAFETY_CLASSIFIER_PROMPT } from './reasoning/safety.js';
import {
  buildAskUserTool,
  decorateToolDescription,
  filterToolsForPolicy,
  initialToolChoice,
  maxActSteps,
  omitGetRagWhenGrounded,
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
  DEFAULT_NO_IMPROVEMENT_LIMIT,
  DEFAULT_REFLECT_RETRIES,
  MAX_REFLECT_RETRIES,
  MIN_QUALITY_DELTA,
  draftsEquivalent,
  scoreDraft,
  shouldStopImproving,
} from './reasoning/quality.js';
import {
  resolveConfiguredChoice,
  resolveConfiguredFlag,
  resolveConfiguredNumber,
  resolveConfiguredRaw,
} from '../tool/shared/pipeline.js';

export type ReasoningLlmCall = (args: {
  purpose: 'safety' | 'frame' | 'plan' | 'act' | 'reflect';
  system: string;
  user: string;
  tools?: ToolSet;
  maxTokens?: number;
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

function toNodeOutput(
  result: ReasoningResult,
  extra: { query: string; snippets: string[]; endpoint: string },
): NodeOutput {
  return {
    status: result.status,
    text: result.text,
    sql: extractSql(result.text),
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
    if (call.purpose === 'act' && call.tools && Object.keys(call.tools).length && ctx.c.env.AI) {
      const workersAI = createWorkersAI({
        binding: ctx.c.env.AI,
        gateway: WORKERS_AI_GATEWAY,
      });
      let billedSteps = 0;
      const result = await withAiCapacityRetry(async () =>
        generateText({
          model: workersAI(modelId as never),
          system: call.system,
          messages: [{ role: 'user', content: call.user }],
          maxOutputTokens: limit,
          temperature: args.temperature,
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
        toolCalls?: Array<{ toolName?: string }>;
        toolResults?: Array<{ toolName?: string; result?: unknown }>;
      }>;
      for (const step of steps) {
        for (const tr of step.toolResults ?? []) {
          const name = String(tr.toolName ?? '');
          const payload = tr.result;
          observations.push({
            tool: name,
            ok: !(payload && typeof payload === 'object' && 'ok' in payload && (payload as { ok?: boolean }).ok === false),
            output: truncate(payload),
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
      temperature: args.temperature,
      top_p: args.topP,
      frequency_penalty: args.frequencyPenalty,
      presence_penalty: args.presencePenalty,
    });
    const text = asText(extractTextFromAiResponse(aiResponse));
    await onBill?.(aiResponse, text);
    return {
      text,
      usage: aiResponse,
      observations: [],
    };
  };
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
  let nodeInput = { ...(ctx.nodeInput ?? {}) } as Record<string, unknown>;
  let userText = resolveAgentUserText(data, nodeInput, ctx.input);

  const prefetched = await prefetchLinkedGetRag({ ...ctx, nodeInput }, ctx.node.id, userText);
  if (prefetched.ragText) {
    nodeInput = {
      ...nodeInput,
      ragText: prefetched.ragText,
      snippets: prefetched.snippets,
      query:
        typeof nodeInput.query === 'string' && nodeInput.query.trim()
          ? nodeInput.query
          : prefetched.query,
    };
    userText = resolveAgentUserText(data, nodeInput, userText || ctx.input);
  }

  const optionScope = { ...nodeInput, input: ctx.input ?? '' };
  const options = readReasoningOptions(data, optionScope);

  const agentScope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: ctx.input ?? '' };
  const userSystem = interpolateTemplate(String(data.systemPrompt ?? ''), agentScope);

  const pdfFiles = filesFromWebhookBody(nodeInput.body ?? ctx.nodeInput);
  if (pdfFiles.length) {
    const extracted = await extractTextFromPdfFiles(ctx.c.env, pdfFiles);
    if (extracted.length) {
      userText = `${userText}\n\nExtracted PDF text:\n${extracted.map((f) => `--- ${f.filename} ---\n${f.text}`).join('\n\n')}`;
    }
  }

  const safetyIn = ruleClassify(userText);
  if (safetyIn.action === 'refuse') {
    return toNodeOutput(refusedResult(safetyIn.reason, safetyIn.category), {
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
      return toNodeOutput(refusedResult(parsed.reason, parsed.category), {
        query: userText,
        snippets: [],
        endpoint,
      });
    }
  }

  const sessionId =
    resolveSessionId(nodeInput, String(ctx.runContext.sessionId ?? '')) ||
    `wf:${ctx.meta.workflowId}`;
  const session = await loadSessionMemory(
    ctx.userDO,
    memoryKey(ctx.meta.workflowId, sessionId, ctx.node.id),
  );

  const memoryCollection = isLinkedSimpleMemory(linked)
    ? ''
    : String(data.memoryCollection ?? linked.memoryCollection ?? '').trim();
  const memoryNamespace = String(linked.memoryNamespace ?? '').trim() || undefined;
  const simpleMemory = await attachSimpleMemory(ctx, linked, userText);
  const ragSnippets = snippetTexts(nodeInput.snippets);
  const semantic =
    memoryCollection && !agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-rag')
      ? await retrieveSemanticMemory(ctx.c.env, memoryCollection, userText, 4, memoryNamespace)
      : [];
  const snippets = [...new Set([...ragSnippets, ...semantic].map((s) => s.trim()).filter(Boolean))];

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
              );
              return { snippets: found, count: found.length };
            },
          }),
        }
      : {};

  const baseTools: ToolSet = omitGetRagWhenGrounded(
    { ...httpTools, ...ragTools, ...memoryTool, ...buildAskUserTool() },
    snippets.length > 0,
  );
  for (const [name, def] of Object.entries(baseTools)) {
    const description = String((def as { description?: string }).description ?? '');
    (def as { description?: string }).description = decorateToolDescription(name, description);
  }

  const toolNames = Object.keys(baseTools);
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

  if (options.clarificationMode === 'ask' && !frame.missingSlots.length) {
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
    await saveSessionMemory(ctx.userDO, {
      workflowId: ctx.meta.workflowId,
      sessionId,
      agentId: ctx.node.id,
      summary: `Asked for ${frame.missingSlots.join(', ')}`,
      status: result.status,
    });
    await simpleMemory.persist(questions.join('\n'));
    return toNodeOutput(result, { query: userText, snippets, endpoint });
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
  const citationSeed = buildCitations({ snippets, observations: [], sessionSummary: session.summary });
  const systemParts = [
    userSystem,
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    policyNames.length
      ? `You can call these tools when helpful: ${policyNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer. Call ${ASK_USER_TOOL} if required details are missing.`
      : `If you lack required details, say so and ask. Do not guess.`,
    session.summary ? `Session memory:\n${session.summary}` : '',
    simpleMemory.historyText ? `Previous conversation:\n${simpleMemory.historyText}` : '',
    formatRagContext(snippets) ? `Retrieved knowledge (cite as [n]):\n${formatRagContext(snippets)}` : '',
    options.requireCitations && citationSeed.length
      ? 'Every factual claim must include [n] citations that match the source list.'
      : '',
    plan?.steps.length
      ? `Plan:\n${plan.steps.map((s) => `${s.id}. ${s.action}${s.tool ? ` [${s.tool}]` : ''}`).join('\n')}`
      : '',
  ].filter(Boolean);

  let draft = '';
  let lastIssues = '';
  let observations: ToolObservation[] = [];
  const stopSteps = maxActSteps(
    resolveConfiguredNumber(data.maxActSteps, optionScope) ?? DEFAULT_ACT_STEPS,
  );
  let bestText = '';
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCitations: AgentCitation[] = [];
  let stagnant = 0;

  const finish = async (text: string, cites: AgentCitation[]) => {
    const outText = groundedTextOrFallback(text, cites);
    const outputSafety = ruleClassify(outText);
    if (outputSafety.action === 'refuse') {
      return toNodeOutput(refusedResult(outputSafety.reason, outputSafety.category), {
        query: userText,
        snippets,
        endpoint,
      });
    }
    const result: ReasoningResult = {
      status: 'ok',
      text: outText,
      citations: cites,
      plan: plan?.steps,
      confidence: frame.confidence,
      frame,
    };
    await saveSessionMemory(ctx.userDO, {
      workflowId: ctx.meta.workflowId,
      sessionId,
      agentId: ctx.node.id,
      summary: outText.slice(0, 240),
      status: result.status,
    });
    if (memoryCollection) {
      await persistSemanticEpisode(ctx.c.env, memoryCollection, outText.slice(0, 400), memoryNamespace);
    }
    await simpleMemory.persist(outText);
    return toNodeOutput(result, { query: userText, snippets, endpoint });
  };

  for (let attempt = 0; attempt <= options.maxReflectRetries; attempt += 1) {
    const act = await llm({
      purpose: 'act',
      system: systemParts.join('\n\n'),
      user:
        attempt === 0
          ? userText
          : `${userText}\n\nRevise the previous draft:\n${draft}\nIssues: ${lastIssues}\nImprove the answer. Stop if you cannot do better than the draft.\nKeep citations as [n].`,
      tools: policyNames.length ? policyTools : undefined,
      toolChoice: policyNames.length ? initialToolChoice(policyNames, plan, snippets.length > 0) : undefined,
      stopSteps,
    });
    observations = [...observations, ...(act.observations ?? [])];
    if (act.askedUser?.questions?.length) {
      const result = clarificationResult(act.askedUser.questions, act.askedUser.why ?? '', frame);
      result.plan = plan?.steps;
      await saveSessionMemory(ctx.userDO, {
        workflowId: ctx.meta.workflowId,
        sessionId,
        agentId: ctx.node.id,
        summary: `Asked: ${act.askedUser.questions.join('; ')}`,
        status: result.status,
      });
      await simpleMemory.persist(act.askedUser.questions.join('\n'));
      return toNodeOutput(result, { query: userText, snippets, endpoint });
    }
    draft = asText(act.text);

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
      requireCitations: options.requireCitations,
      userText,
      snippets,
    });
    const quality = scoreDraft({
      text: draft,
      issues: heuristic.issues,
      citations,
      observations,
      snippets,
      userText,
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
      return finish(bestText || draft, bestCitations.length ? bestCitations : citations);
    }

    const critique = await llm({
      purpose: 'reflect',
      system: REFLECT_PROMPT,
      user: `Draft:\n${draft}\nSources:\n${formatCitationBlock(citations)}\nTool results:\n${observations.map((o) => `${o.tool}: ${o.output}`).join('\n')}`,
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
        requireCitations: options.requireCitations,
        userText,
        snippets,
      });
      const rewrittenScore = scoreDraft({
        text: draft,
        issues: rewrittenHeuristic.issues,
        citations: rewrittenCitations,
        observations,
        snippets,
        userText,
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
        return finish(bestText || draft, bestCitations.length ? bestCitations : rewrittenCitations);
      }
    }
  }

  return finish(bestText || draft, bestCitations);
}
