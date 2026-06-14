import { stepCountIs, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

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
import { filesFromWebhookBody, extractTextFromPdfFiles } from '../tool/pdf-extract.js';
import type { NodeContext, NodeOutput } from '../types.js';

function resolveEmbedModel(service: Record<string, unknown>): string {
  const catalog = String(service.catalogId ?? service.catalog_id ?? '').trim();
  if (catalog.includes('bge')) return DEFAULT_EMBED_MODEL;
  const model = String(service.embedModel ?? service.embed_model ?? '').trim();
  return model || DEFAULT_EMBED_MODEL;
}

function extractTriggerContext(ctx: NodeContext): Record<string, unknown> {
  const input = ctx.nodeInput ?? {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (obj.triggerKind === 'form' || obj.dbId || obj.tableName) return obj;
    if (obj.parents && typeof obj.parents === 'object') {
      const parents = obj.parents as Record<string, Record<string, unknown>>;
      for (const parent of Object.values(parents)) {
        if (parent?.triggerKind === 'form' || parent?.dbId || parent?.tableName) return parent;
      }
    }
  }
  return {};
}

export async function executeAgent(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const linked = resolveAgentResources(ctx.definition, ctx.node.id);
  const endpoint = String(
    linked.serviceEndpoint ?? data.serviceEndpoint ?? data.endpoint ?? '',
  ).trim();
  if (!endpoint) throw new Error('Agent node missing serviceEndpoint (connect a service node or pick a service)');

  await ensureWalletBalance(ctx.userDO);
  const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
  const modelId = getModelForService(service);
  const embedModel = resolveEmbedModel(service);

  const promptSource = String(data.promptSource ?? 'define_below');
  let userText =
    promptSource === 'from_input'
      ? String(ctx.nodeInput.text ?? ctx.input ?? '') || JSON.stringify(ctx.nodeInput)
      : String(data.prompt ?? ctx.nodeInput.text ?? ctx.input ?? '') || JSON.stringify(ctx.nodeInput);

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

  const memoryCollection = String(
    data.memoryCollection ?? linked.memoryCollection ?? '',
  ).trim();
  const memoryNode = ctx.definition.nodes.find((n) => {
    if (n.type !== 'memory_node') return false;
    return ctx.definition.edges.some(
      (e) => e.source === n.id && e.target === ctx.node.id && e.targetHandle === 'memory',
    );
  });
  const memData = (memoryNode?.data ?? {}) as Record<string, unknown>;
  const memoryNamespace = String(memData.namespace ?? '').trim();

  const hasGetRagTool = agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-rag');
  const ragTools = buildRagToolset(
    {
      env: ctx.c.env,
      userDO: ctx.userDO,
      agentId: ctx.node.id,
      triggerContext: extractTriggerContext(ctx),
      embedModel,
    },
    ctx.definition,
    ctx.node.id,
  );
  const httpTools = buildAgentToolset({ env: ctx.c.env, userDO: ctx.userDO }, ctx.definition);
  const tools = { ...httpTools, ...ragTools };
  const toolNames = Object.keys(tools);
  const useToolLoop = toolNames.length > 0;

  const memorySnippets =
    memoryCollection &&
    !hasGetRagTool &&
    linked.memoryKind !== 'r2' &&
    linked.memoryKind !== 'd1'
      ? await retrieveMemory(ctx.c.env, memoryCollection, userText, 5, memoryNamespace || undefined)
      : [];

  const systemParts = [
    String(data.systemPrompt ?? ''),
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    memorySnippets.length ? `Relevant memory:\n${memorySnippets.join('\n')}` : '',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.`
      : '',
    hasGetRagTool
      ? 'Use get_rag to search the knowledge base before answering factual questions.'
      : '',
    agentHasRagToolKind(ctx.definition, ctx.node.id, 'save-rag')
      ? 'Use save_rag to persist extracted document text into the knowledge base.'
      : '',
    agentHasRagToolKind(ctx.definition, ctx.node.id, 'get-db-info')
      ? 'Call get_db_info first to load table schema and sample rows before generating schema or SQL examples.'
      : '',
  ].filter(Boolean);

  const maxTokens = Number(data.maxTokens ?? 1024) || 1024;

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

  const aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens);
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
