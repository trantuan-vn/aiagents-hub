import {
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../billing.js';
import { resolveAgentResources } from '../../engine/graph-helpers.js';
import type { NodeContext, NodeOutput } from '../types.js';

async function queryVectorMemory(
  env: Env,
  collection: string,
  query: string,
): Promise<string[]> {
  const binding = (env as unknown as Record<string, unknown>).VECTORIZE as
    | { query: (vector: number[], opts: { topK: number }) => Promise<{ matches?: { metadata?: Record<string, string> }[] }> }
    | undefined;
  if (!binding?.query || !query.trim()) return [];

  try {
    const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query });
    const vector = (embed as { data?: number[][] })?.data?.[0];
    if (!vector?.length) return [];
    const index = (env as unknown as Record<string, unknown>)[collection] as typeof binding | undefined;
    const target = index ?? binding;
    const result = await target.query(vector, { topK: 5 });
    return (result.matches ?? [])
      .map((m) => m.metadata?.text ?? m.metadata?.content ?? '')
      .filter(Boolean);
  } catch (e) {
    console.warn('[workflow] vector memory query failed:', e);
    return [];
  }
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

  const promptSource = String(data.promptSource ?? 'define_below');
  const userText =
    promptSource === 'from_input'
      ? String(ctx.nodeInput.text ?? ctx.input ?? '') || JSON.stringify(ctx.nodeInput)
      : String(data.prompt ?? ctx.nodeInput.text ?? ctx.input ?? '') || JSON.stringify(ctx.nodeInput);

  const memoryCollection = String(
    data.memoryCollection ?? linked.memoryCollection ?? '',
  ).trim();
  const memorySnippets =
    memoryCollection && linked.memoryKind !== 'r2' && linked.memoryKind !== 'd1'
      ? await queryVectorMemory(ctx.c.env, memoryCollection, userText)
      : [];

  const toolList =
    Array.isArray(data.tools) && data.tools.length
      ? (data.tools as unknown[])
      : linked.tools;

  const systemParts = [
    String(data.systemPrompt ?? ''),
    ctx.meta.workflowDescription ? `Workflow: ${ctx.meta.workflowDescription}` : '',
    memorySnippets.length ? `Relevant memory:\n${memorySnippets.join('\n')}` : '',
    toolList.length
      ? `Available tools (configure in service): ${JSON.stringify(toolList)}`
      : '',
  ].filter(Boolean);

  const messages = [
    ...(systemParts.length ? [{ role: 'system', content: systemParts.join('\n\n') }] : []),
    { role: 'user', content: userText },
  ];

  const maxTokens = Number(data.maxTokens ?? 1024) || 1024;
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
