import { stepCountIs, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { interpolate } from '../../execution/node-runtime.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
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
import { resolveAgentResources } from '../../engine/graph-helpers.js';
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

function resolveMaxTokens(
  agentData: Record<string, unknown>,
  serviceOptions?: Record<string, unknown>,
): number {
  const fromService = serviceOptions?.maxTokens;
  const raw = fromService ?? agentData.maxTokens ?? 1024;
  return Number(raw) || 1024;
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
  const body = nodeInput.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    const q = rec.question ?? rec.query ?? rec.prompt ?? rec.text;
    if (q != null && String(q).trim()) return String(q);
  }
  if (typeof body === 'string' && body.trim()) return body;
  if (nodeInput.question != null && String(nodeInput.question).trim()) return String(nodeInput.question);
  if (nodeInput.query != null && String(nodeInput.query).trim()) return String(nodeInput.query);
  if (fallbackInput?.trim()) return fallbackInput;
  const hasSnippets = Array.isArray(nodeInput.snippets) && nodeInput.snippets.length > 0;
  if (!hasSnippets && nodeInput.text != null && String(nodeInput.text).trim()) return String(nodeInput.text);
  return JSON.stringify(nodeInput);
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

  let userText = resolveAgentUserText(data, ctx.nodeInput as Record<string, unknown>, ctx.input);

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
  if (!ragContext.length && hasGetRagTool) {
    const retrieved = await executeGetRag({
      env: ctx.c.env,
      definition: ctx.definition,
      agentId: ctx.node.id,
      input: { query: userText },
      embedModel,
      ownerId: ctx.meta.ownerId,
      workflowId: ctx.meta.workflowId,
    });
    ragContext = retrieved.snippets.map((s) => {
      const source = s.source?.trim();
      return source ? `[${source}]\n${s.text}` : s.text;
    });
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
    String(data.systemPrompt ?? ''),
    saveRagSystemPrompt,
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    memorySnippets.length
      ? `Relevant knowledge from the vector store:\n${memorySnippets.join('\n\n')}`
      : '',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.`
      : '',
    memorySnippets.length
      ? 'Use the retrieved schema and SQL examples. Return a single read-only SQL query in a fenced sql code block, qualifying tables as schema.table. Do not invent tables or columns that are not in the retrieved context.'
      : hasGetRagTool
        ? 'No relevant schema was retrieved from the knowledge base. Do not invent tables or columns.'
        : '',
    hasSaveRagTool && !saveRagSystemPrompt
      ? 'Use save_rag to persist extracted document text into the knowledge base.'
      : '',
    agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-db-info')
      ? 'Call get_db_info first to load table schema and sample rows before generating schema or SQL examples.'
      : '',
  ].filter(Boolean);

  const maxTokens = resolveMaxTokens(data, linked.serviceOptions);
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
    return { text, raw: { usage, toolNames }, endpoint };
  }

  const messages = [
    ...(systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []),
    { role: 'user', content: userText },
  ];

  const aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens, modelParams);
  const text = extractTextFromAiResponse(aiResponse);

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
  return { text, raw: aiResponse, endpoint };
}
