import { stepCountIs, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { gatewayForExecution, stampFromNode, withAiCapacityRetry } from '../../ai/workers-ai.js';
import { noteAgentWork, reportAgentReasoning, withAgentActivity } from '../../execution/execution-progress.js';
import { followAgentStream } from '../../ai/workers-ai-stream.js';

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
import {
  agentHasRagToolKind,
  buildAgentToolset,
  buildRagToolset,
} from '../../execution/agent-runtime.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import { attachSimpleMemory } from '../memory-node/simple.js';
import { appendMemberActionsNote } from '../../../../assistant/confirmation.js';
import { ragBillingFromNodeContext, toolNodeConfig } from '../tool/shared/rag-context.js';
import { prefetchLinkedGetRag } from '../tool/get-rag/execute.js';
import { filesFromWebhookBody, extractTextFromPdfFiles } from '../tool/save-rag/pdf-extract.js';
import type { NodeContext, NodeOutput } from '../types.js';
import { executeReasoningAgent } from './execute-reasoning.js';
import { omitGetRagWhenGrounded } from './reasoning/tools.js';
import {
  aiParamsFromServiceOptions,
  assertTextGenerationModel,
  extractSql,
  interpolateTemplate,
  isReasoningAgentKind,
  resolveAgentUserText,
  resolveEmbedModel,
  resolveMaxTokens,
  usesForcedReasoning,
} from './shared.js';

export async function executeAgent(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  if (isReasoningAgentKind(data)) return executeReasoningAgent(ctx);
  const linked = resolveAgentResources(ctx.definition, ctx.node.id, {
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  const endpoint = String(
    linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '',
  ).trim();
  if (!endpoint) throw new Error('Agent node missing serviceEndpoint (connect a service node or pick a service)');

  await ensureWalletBalance(ctx.userDO, ctx.c.env);
  const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
  const modelId = getModelForService(service);

  const billOnce = async (usage: unknown, fallbackText: string) => {
    const charge = await billAgentUsage(
      ctx.c.env,
      ctx.bindingName,
      ctx.userDO,
      ctx.user.identifier,
      service,
      {
        endpoint,
        aiResponse: asBillingAiResponse(usage, fallbackText),
        userAgent: ctx.requestMeta?.userAgent,
        ipAddress: ctx.requestMeta?.ipAddress,
        workflowAttribution: ctx.attr,
        executionKey: ctx.executionKey,
      },
    );
    reportUsageCharge(ctx.onCost, charge);
  };
  
  assertTextGenerationModel(modelId);
  const embedModel = resolveEmbedModel(service);

  const hasSaveRagTool = agentHasRagToolKind(ctx.definition, ctx.node.id, 'save-rag');
  const saveRagConfig = hasSaveRagTool
    ? (toolNodeConfig(ctx.definition, ctx.node.id, 'save-rag') ?? {})
    : undefined;
  const saveRagSystemPrompt = String(saveRagConfig?.systemPrompt ?? '').trim();
  const saveRagUserPrompt = String(saveRagConfig?.userPrompt ?? '').trim();

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
  const agentScope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: ctx.input ?? '' };
  const systemPrompt = interpolateTemplate(String(data.systemPrompt ?? ''), agentScope);

  const pdfFiles = filesFromWebhookBody(
    (ctx.nodeInput as Record<string, unknown>)?.body ?? ctx.nodeInput,
  );
  if (pdfFiles.length) {
    const extracted = await extractTextFromPdfFiles(ctx.c.env, pdfFiles);
    if (extracted.length) {
      const pdfContext = extracted.map((f) => `--- ${f.filename} ---\n${f.text}`).join('\n\n');
      userText = `${userText}\n\nExtracted PDF text:\n${pdfContext}`;
    }
  }

  if (saveRagUserPrompt) {
    userText = userText ? `${saveRagUserPrompt}\n\n${userText}` : saveRagUserPrompt;
  }

  const billing = ragBillingFromNodeContext(ctx);
  const textStamp = stampFromNode(ctx, 'text');
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
        executionKey: textStamp.executionKey,
        workflowId: textStamp.workflowId,
        nodeId: textStamp.nodeId,
      },
      c: ctx.c,
      bindingName: ctx.bindingName,
      user: ctx.user,
    },
    ctx.definition,
    ctx.node.id,
  );
  const httpTools = buildAgentToolset({ env: ctx.c.env, userDO: ctx.userDO }, ctx.definition);
  const ragSnippets = Array.isArray(nodeInput.snippets) ? nodeInput.snippets : [];
  const useRetrievedSqlContext = Boolean(String(nodeInput.ragText ?? '').trim() || ragSnippets.length);
  const tools = omitGetRagWhenGrounded({ ...httpTools, ...ragTools }, useRetrievedSqlContext);
  const toolNames = Object.keys(tools);
  const useToolLoop = toolNames.length > 0;

  const systemParts = [
    appendMemberActionsNote(systemPrompt, linked.tools),
    saveRagSystemPrompt,
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.`
      : '',
    hasSaveRagTool && !saveRagSystemPrompt
      ? 'Use save_rag to persist extracted document text into the knowledge base.'
      : '',
    agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-db-info')
      ? 'Call get_db_info first to load table schema and sample rows before generating schema or SQL examples.'
      : '',
  ].filter(Boolean);

  const maxTokens = resolveMaxTokens(data, linked.serviceOptions, modelId, nodeInput);
  const forcedReasoning = usesForcedReasoning(modelId);
  // GLM-5.3 defaults reasoning_effort to max. Keep effort low for speed, but do not
  // shrink the answer budget: a 2048 cap was cutting HTML off mid-table.
  const outputLimit = forcedReasoning ? Math.max(maxTokens, 8192) : maxTokens;
  const modelParams = {
    ...aiParamsFromServiceOptions(linked.serviceOptions),
    ...(forcedReasoning ? { reasoning_effort: 'low', max_completion_tokens: outputLimit } : {}),
  };
  const simpleMemory = await attachSimpleMemory(ctx, linked, userText);
  const historyMessages = simpleMemory.history.map((m) => ({ role: m.role, content: m.content }));

  return withAgentActivity(ctx, async () => {
  await reportAgentReasoning(ctx);
  noteAgentWork('answer');

  if (useToolLoop && ctx.c.env.AI) {
    let billedSteps = 0;
    const result = await withAiCapacityRetry(async () => {
      const workersAI = createWorkersAI({
        binding: ctx.c.env.AI,
        gateway: gatewayForExecution({ ...textStamp, kind: 'agent' }),
      });
      const streamed = streamText({
        model: workersAI(modelId as never),
        system: systemParts.join('\n\n'),
        messages: [...historyMessages, { role: 'user', content: userText }],
        maxOutputTokens: outputLimit,
        temperature: modelParams.temperature as number | undefined,
        topP: modelParams.top_p as number | undefined,
        frequencyPenalty: modelParams.frequency_penalty as number | undefined,
        presencePenalty: modelParams.presence_penalty as number | undefined,
        ...(forcedReasoning
          ? { providerOptions: { 'workers-ai': { reasoning_effort: 'low' as const } } }
          : {}),
        tools,
        stopWhen: stepCountIs(5),
      });
      await followAgentStream(streamed.fullStream);
      const [text, steps, totalUsage, usage, finishReason] = await Promise.all([
        streamed.text,
        streamed.steps,
        streamed.totalUsage,
        streamed.usage,
        streamed.finishReason,
      ]);
      return { text, steps, totalUsage, usage, finishReason };
    });
    for (const step of result.steps ?? []) {
      if ((step as { usage?: unknown }).usage == null) continue;
      billedSteps += 1;
      await billOnce((step as { usage?: unknown }).usage, String((step as { text?: unknown }).text ?? ''));
    }

    let text = result.text;
    if (result.finishReason === 'length' && text.trim()) {
      try {
      const continued = await withAiCapacityRetry(async () => {
        const workersAI = createWorkersAI({
          binding: ctx.c.env.AI,
          gateway: gatewayForExecution({ ...textStamp, kind: 'agent' }),
        });
        const streamed = streamText({
          model: workersAI(modelId as never),
          system: systemParts.join('\n\n'),
          messages: [
            ...historyMessages,
            { role: 'user', content: userText },
            { role: 'assistant', content: text },
            {
              role: 'user',
              content:
                'The answer was cut off. Continue from the exact cutoff, without repeating text already written, until the answer and every HTML tag are finished.',
            },
          ],
          maxOutputTokens: outputLimit,
          temperature: modelParams.temperature as number | undefined,
          ...(forcedReasoning
            ? { providerOptions: { 'workers-ai': { reasoning_effort: 'low' as const } } }
            : {}),
        });
        await followAgentStream(streamed.fullStream);
        const [more, usage] = await Promise.all([streamed.text, streamed.usage]);
        return { text: more, usage };
      });
      if (continued.text.trim()) text = `${text}${continued.text}`;
      await billOnce(continued.usage, continued.text);
      } catch (e) {
        console.warn('[agent] continue after length cutoff failed', e instanceof Error ? e.message : String(e));
      }
    }
    await billGenerateTextCalls(billOnce, result, billedSteps);
    const usage = result.totalUsage ?? result.usage;
    await simpleMemory.persist(text);
    return {
      text,
      sql: extractSql(text),
      query: userText,
      snippets: ragSnippets,
      count: ragSnippets.length,
      raw: { usage, toolNames },
      endpoint,
    };
  }

  const messages = [
    ...(systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []),
    ...historyMessages,
    { role: 'user', content: userText },
  ];

  let aiResponse = await runTextModel(ctx.c.env, modelId, messages, outputLimit, modelParams, textStamp);
  let text = extractTextFromAiResponse(aiResponse);
  await billOnce(aiResponse, text);
  let sql = extractSql(text);

  if (useRetrievedSqlContext && (!sql || (finishReasonFromAiResponse(aiResponse) === 'length' && !/```sql/i.test(text)))) {
    const retryTokens = Math.max(maxTokens, 4096);
    aiResponse = await runTextModel(
      ctx.c.env,
      modelId,
      [
        ...messages,
        {
          role: 'user',
          content:
            'Stop analyzing. Output only one read-only SQL query in a fenced sql code block. No explanation.',
        },
      ],
      retryTokens,
      modelParams,
      textStamp,
    );
    const retryText = extractTextFromAiResponse(aiResponse);
    await billOnce(aiResponse, retryText);
    text = retryText || text;
    sql = extractSql(text);
  }

  await simpleMemory.persist(text);
  return {
    text,
    sql,
    query: userText,
    snippets: ragSnippets,
    count: ragSnippets.length,
    raw: aiResponse,
    endpoint,
  };
  });
}
