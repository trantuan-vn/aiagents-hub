import { stepCountIs, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { interpolate } from '../../execution/node-runtime.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  finishReasonFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../billing/billing.js';
import {
  agentHasRagToolKind,
  buildAgentToolset,
  buildRagToolset,
  retrieveMemory,
} from '../../execution/agent-runtime.js';
import { isDataFlowEdge, resolveAgentResources } from '../../engine/graph-helpers.js';
import { DEFAULT_EMBED_MODEL } from '../../rag-vector.js';
import { toolNodeConfig } from '../tool/shared/rag-context.js';
import { filesFromWebhookBody, extractTextFromPdfFiles } from '../tool/save-rag/pdf-extract.js';
import { executeGetRag } from '../tool/get-rag/execute.js';
import type { NodeContext, NodeOutput } from '../types.js';

function aiParamsFromServiceOptions(opts?: Record<string, unknown>): Record<string, unknown> {
  if (!opts) return {};
  const out: Record<string, unknown> = {};
  if (opts.temperature != null && opts.temperature !== '') out.temperature = Number(opts.temperature);
  if (opts.topP != null && opts.topP !== '') out.top_p = Number(opts.topP);
  if (opts.frequencyPenalty != null && opts.frequencyPenalty !== '') {
    out.frequency_penalty = Number(opts.frequencyPenalty);
  }
  if (opts.presencePenalty != null && opts.presencePenalty !== '') {
    out.presence_penalty = Number(opts.presencePenalty);
  }
  if (opts.responseFormat === 'json_object') out.response_format = { type: 'json_object' };
  return out;
}

function isReasoningModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes('glm') ||
    id.includes('think') ||
    id.includes('reason') ||
    id.includes('qwq') ||
    id.includes('deepseek-r1')
  );
}

function resolveMaxTokens(
  agentData: Record<string, unknown>,
  serviceOptions?: Record<string, unknown>,
  modelId = '',
): number {
  const fallback = isReasoningModel(modelId) ? 4096 : 1024;
  const fromService = serviceOptions?.maxTokens;
  const raw = fromService ?? agentData.maxTokens ?? fallback;
  return Number(raw) || fallback;
}

/** Embedding models cannot be used with streamText / chat completions. */
function assertTextGenerationModel(modelId: string): void {
  const id = modelId.toLowerCase();
  if (id.includes('bge') || id.includes('embed')) {
    throw new Error(
      `Agent requires a text generation model (e.g. @cf/meta/llama-3.1-8b-instruct), but the connected service uses embedding model "${modelId}". Connect an LLM service to the Agent "Service" handle; keep embedding models for Memory/RAG tools only.`,
    );
  }
}

function resolveEmbedModel(service: Record<string, unknown>): string {
  const catalog = String(service.catalogId ?? service.catalog_id ?? '').trim();
  if (catalog.includes('bge')) return DEFAULT_EMBED_MODEL;
  const model = String(service.embedModel ?? service.embed_model ?? '').trim();
  return model || DEFAULT_EMBED_MODEL;
}

function extractQuestionText(nodeInput: Record<string, unknown>, fallbackInput?: string): string {
  if (typeof nodeInput.query === 'string' && nodeInput.query.trim()) return nodeInput.query.trim();
  if (typeof nodeInput.question === 'string' && nodeInput.question.trim()) return nodeInput.question.trim();
  const body = nodeInput.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    const q = rec.question ?? rec.query ?? rec.prompt ?? rec.text ?? rec.message;
    if (q != null && String(q).trim()) return String(q);
  }
  if (typeof body === 'string' && body.trim()) return body;
  if (fallbackInput?.trim()) return fallbackInput;
  const hasSnippets = Array.isArray(nodeInput.snippets) && nodeInput.snippets.length > 0;
  if (!hasSnippets && nodeInput.text != null && String(nodeInput.text).trim()) return String(nodeInput.text);
  return JSON.stringify(nodeInput);
}

function agentHasUpstreamGetRag(
  definition: import('../../domain/domain.js').WorkflowDefinition,
  agentId: string,
): boolean {
  return definition.edges.some((edge) => {
    if (edge.target !== agentId || !isDataFlowEdge(edge)) return false;
    const source = definition.nodes.find((n) => n.id === edge.source);
    if (source?.type !== 'tool_node') return false;
    return String((source.data as Record<string, unknown> | undefined)?.toolKind ?? '') === 'get-rag';
  });
}

function extractSql(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && /"choices"\s*:/.test(trimmed)) return '';

  const fenced = trimmed.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const generic = trimmed.match(/```\s*([\s\S]*?)```/);
  if (generic?.[1] && /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i.test(generic[1])) {
    return generic[1].trim();
  }
  const select = trimmed.match(/\b((?:WITH|SELECT)\b[\s\S]{12,8000}?)(?:;|$)/i);
  if (select?.[1]?.trim()) {
    const sql = select[1].trim();
    return /;$/.test(sql) ? sql : `${sql};`;
  }
  if (/^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i.test(trimmed) && trimmed.length < 8000) {
    return trimmed;
  }
  return '';
}

function ragSnippetsFromInput(nodeInput: Record<string, unknown>): string[] {
  const snippets = nodeInput.snippets;
  if (Array.isArray(snippets) && snippets.length) {
    return snippets
      .map((s) => {
        if (typeof s === 'string') return s.trim();
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          const rec = s as Record<string, unknown>;
          const text = String(rec.text ?? '').trim();
          const source = rec.source != null ? String(rec.source).trim() : '';
          if (!text) return '';
          return source ? `[${source}]\n${text}` : text;
        }
        return '';
      })
      .filter(Boolean);
  }
  const ragText = String(nodeInput.ragText ?? '').trim();
  return ragText ? [ragText] : [];
}

function withoutGetRagTools<T extends Record<string, unknown>>(tools: T): T {
  const out = { ...tools };
  for (const key of Object.keys(out)) {
    const normalized = key.replace(/-/g, '_');
    if (normalized === 'get_rag' || normalized.endsWith('_get_rag')) {
      delete out[key];
    }
  }
  return out;
}

function interpolateTemplate(template: string, scope: Record<string, unknown>): string {
  if (!template.includes('{{')) return template;
  const resolved = interpolate(template, scope);
  if (resolved == null) return '';
  return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
}

function resolveAgentUserText(
  data: Record<string, unknown>,
  nodeInput: Record<string, unknown>,
  fallbackInput?: string,
): string {
  const promptSource = String(data.promptSource ?? 'define_below');
  const prompt = String(data.prompt ?? '');
  const scope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: fallbackInput ?? '' };

  if (prompt.includes('{{')) {
    const resolved = interpolate(prompt, scope);
    if (resolved != null && String(resolved).trim()) return String(resolved);
  }

  if (promptSource === 'from_input') {
    return extractQuestionText(nodeInput, fallbackInput);
  }

  if (prompt.trim()) return prompt;
  return extractQuestionText(nodeInput, fallbackInput);
}

function extractTriggerContext(ctx: NodeContext): Record<string, unknown> {
  const input = ctx.nodeInput ?? {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export async function executeAgent(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const linked = resolveAgentResources(ctx.definition, ctx.node.id, {
    ownerId: ctx.meta.ownerId,
    workflowId: ctx.meta.workflowId,
  });
  const endpoint = String(
    linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '',
  ).trim();
  if (!endpoint) throw new Error('Agent node missing serviceEndpoint (connect a service node or pick a service)');

  await ensureWalletBalance(ctx.userDO);
  const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
  const modelId = getModelForService(service);
  
  assertTextGenerationModel(modelId);
  const embedModel = resolveEmbedModel(service);

  const hasSaveRagTool = agentHasRagToolKind(ctx.definition, ctx.node.id, 'save-rag');
  const saveRagConfig = hasSaveRagTool
    ? (toolNodeConfig(ctx.definition, ctx.node.id, 'save-rag') ?? {})
    : undefined;
  const saveRagSystemPrompt = String(saveRagConfig?.systemPrompt ?? '').trim();
  const saveRagUserPrompt = String(saveRagConfig?.userPrompt ?? '').trim();

  const nodeInput = (ctx.nodeInput ?? {}) as Record<string, unknown>;
  const agentScope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: ctx.input ?? '' };
  let userText = resolveAgentUserText(data, nodeInput, ctx.input);
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

  const memoryCollection = String(
    data.memoryCollection ?? linked.memoryCollection ?? '',
  ).trim();
  const memoryNamespace = String(linked.memoryNamespace ?? '').trim();

  const hasGetRagTool = agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-rag');
  const hasUpstreamGetRag = agentHasUpstreamGetRag(ctx.definition, ctx.node.id);
  const useRetrievedSqlContext = hasGetRagTool || hasUpstreamGetRag;
  const getRagNodeId = hasUpstreamGetRag
    ? ctx.definition.edges.find(
        (edge) =>
          edge.target === ctx.node.id &&
          isDataFlowEdge(edge) &&
          ctx.definition.nodes.some(
            (n) =>
              n.id === edge.source &&
              n.type === 'tool_node' &&
              String((n.data as Record<string, unknown> | undefined)?.toolKind ?? '') === 'get-rag',
          ),
      )?.source
    : ctx.node.id;
  const ragTools = withoutGetRagTools(
    buildRagToolset(
      {
        env: ctx.c.env,
        userDO: ctx.userDO,
        agentId: ctx.node.id,
        triggerContext: extractTriggerContext(ctx),
        embedModel,
        ownerId: ctx.meta.ownerId,
        workflowId: ctx.meta.workflowId,
      },
      ctx.definition,
      ctx.node.id,
    ),
  );
  const httpTools = buildAgentToolset({ env: ctx.c.env, userDO: ctx.userDO }, ctx.definition);
  const tools = { ...httpTools, ...ragTools };
  const toolNames = Object.keys(tools);
  const useToolLoop = toolNames.length > 0;

  let ragContext = ragSnippetsFromInput(ctx.nodeInput as Record<string, unknown>);
  if (!ragContext.length && useRetrievedSqlContext) {
    const retrieved = await executeGetRag({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId: getRagNodeId ?? ctx.node.id,
      input: { query: userText },
      embedModel: DEFAULT_EMBED_MODEL,
      userDO: ctx.userDO,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
    });
    ragContext = retrieved.snippets.map((s) => {
      const source = s.source?.trim();
      return source ? `[${source}]\n${s.text}` : s.text;
    }).filter(Boolean);
  }

  const memorySnippets =
    ragContext.length
      ? ragContext
      : memoryCollection &&
          linked.memoryKind !== 'r2' &&
          linked.memoryKind !== 'd1'
        ? await retrieveMemory(ctx.c.env, memoryCollection, userText, 5, memoryNamespace || undefined)
        : [];

  const systemParts = [
    systemPrompt,
    !systemPrompt.trim() && useRetrievedSqlContext
      ? 'You are a Text-to-SQL assistant. Use the retrieved table schemas and SQL examples to write one read-only SQL query for the user question.'
      : '',
    saveRagSystemPrompt,
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    memorySnippets.length
      ? `Relevant knowledge from the vector store:\n${memorySnippets.join('\n\n')}`
      : '',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.`
      : '',
    memorySnippets.length
      ? 'Use the retrieved schema and SQL examples. Reply with one read-only SQL query in a fenced sql code block, qualifying tables as schema.table. Keep reasoning under 8 short bullets. Do not spend the token budget on analysis — the SQL is the answer. Do not invent tables or columns that are not in the retrieved context.'
      : hasGetRagTool || hasUpstreamGetRag
        ? 'No relevant schema was retrieved from the knowledge base. Do not invent tables or columns.'
        : '',
    hasSaveRagTool && !saveRagSystemPrompt
      ? 'Use save_rag to persist extracted document text into the knowledge base.'
      : '',
    agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-db-info')
      ? 'Call get_db_info first to load table schema and sample rows before generating schema or SQL examples.'
      : '',
  ].filter(Boolean);

  const maxTokens = resolveMaxTokens(data, linked.serviceOptions, modelId);
  const modelParams = aiParamsFromServiceOptions(linked.serviceOptions);

  if (useToolLoop && ctx.c.env.AI) {
    const workersAI = createWorkersAI({
      binding: ctx.c.env.AI,
      gateway: { id: 'unitoken' },
    });

    const result = streamText({
      model: workersAI(modelId as never),
      system: systemParts.join('\n\n'),
      messages: [{ role: 'user', content: userText }],
      maxOutputTokens: maxTokens,
      temperature: modelParams.temperature as number | undefined,
      topP: modelParams.top_p as number | undefined,
      frequencyPenalty: modelParams.frequency_penalty as number | undefined,
      presencePenalty: modelParams.presence_penalty as number | undefined,
      tools,
      stopWhen: stepCountIs(5),
    });

    const text = await result.text;
    const usage = await result.usage;

    const costVnd = await billAgentUsage(
      ctx.c.env,
      ctx.bindingName,
      ctx.userDO,
      ctx.user.identifier,
      service,
      {
        endpoint,
        aiResponse: usage ? { usage } : { response: text },
        userAgent: ctx.requestMeta?.userAgent,
        ipAddress: ctx.requestMeta?.ipAddress,
        workflowAttribution: ctx.attr,
      },
    );
    ctx.onCost?.(costVnd);
    return {
      text,
      sql: extractSql(text),
      query: userText,
      snippets: ragContext,
      count: ragContext.length,
      raw: { usage, toolNames },
      endpoint,
    };
  }

  const messages = [
    ...(systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []),
    { role: 'user', content: userText },
  ];

  let aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens, modelParams);
  let text = extractTextFromAiResponse(aiResponse);
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
    );
    text = extractTextFromAiResponse(aiResponse) || text;
    sql = extractSql(text);
  }

  const costVnd = await billAgentUsage(
    ctx.c.env,
    ctx.bindingName,
    ctx.userDO,
    ctx.user.identifier,
    service,
    {
      endpoint,
      aiResponse,
      userAgent: ctx.requestMeta?.userAgent,
      ipAddress: ctx.requestMeta?.ipAddress,
      workflowAttribution: ctx.attr,
    },
  );
  ctx.onCost?.(costVnd);
  return {
    text,
    sql,
    query: userText,
    snippets: ragContext,
    count: ragContext.length,
    raw: aiResponse,
    endpoint,
  };
}
