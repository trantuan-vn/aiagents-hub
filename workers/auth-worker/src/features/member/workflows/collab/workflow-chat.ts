import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { getIdFromName } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import {
  agentHasRagToolKind,
  buildAgentToolset,
  buildMemoryTool,
  buildRagToolset,
  retrieveMemory,
} from '../execution/agent-runtime.js';
import { resolveAgentResources } from '../engine/graph-helpers.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  getModelForService,
  resolveServiceByEndpoint,
} from '../billing/billing.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { findPrimaryAgentNode, workflowAttribution } from '../execution/workflow-context.js';

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const textPart = m.parts?.find(
      (p): p is { type: 'text'; text: string } =>
        typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text',
    );
    if (textPart && 'text' in textPart) return textPart.text.trim();
  }
  return '';
}

export async function createWorkflowChatStreamResponse(
  c: any,
  bindingName: string,
  user: { identifier: string },
  resolved: ResolvedWorkflow,
  uiMessages: UIMessage[],
) {
  if (!c.env.AI) {
    throw new Error('AI binding is not configured');
  }

  const agentNode = findPrimaryAgentNode(resolved.definition);
  if (!agentNode) {
    throw new Error('Workflow has no Agent node. Add an Agent node to enable chat.');
  }

  const data = (agentNode.data ?? {}) as Record<string, unknown>;
  const endpoint = String(data.serviceEndpoint ?? data.endpoint ?? '').trim();
  if (!endpoint) {
    throw new Error('Agent node is missing serviceEndpoint');
  }

  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
  await ensureWalletBalance(userDO);
  const service = await resolveServiceByEndpoint(userDO, endpoint);
  const modelId = getModelForService(service);
  const attr = workflowAttribution(resolved);

  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: { id: 'unitoken' },
  });

  const wfName = String(resolved.workflow.name ?? 'Workflow');
  const wfDesc = String(resolved.workflow.description ?? '');
  const latestUser = extractLatestUserText(uiMessages);

  const linked = resolveAgentResources(resolved.definition, agentNode.id);
  const memoryCollection = String(data.memoryCollection ?? linked.memoryCollection ?? '').trim();
  const hasGetRagTool = agentHasRagToolKind(resolved.definition, agentNode.id, 'get-rag');
  const httpTools = buildAgentToolset({ env: c.env, userDO }, resolved.definition);
  const ragTools = buildRagToolset({ env: c.env, userDO }, resolved.definition, agentNode.id);
  const memoryTools =
    memoryCollection && !hasGetRagTool && !Object.keys(ragTools).length
      ? buildMemoryTool(c.env, memoryCollection)
      : {};
  const tools = { ...httpTools, ...ragTools, ...memoryTools };
  const toolNames = Object.keys(tools);

  const ragSnippets =
    memoryCollection && !hasGetRagTool
      ? await retrieveMemory(c.env, memoryCollection, latestUser, 4)
      : [];

  const systemPrompt = [
    `You are the conversational agent for the "${wfName}" workflow.`,
    wfDesc ? `Workflow description: ${wfDesc}` : '',
    String(data.systemPrompt ?? data.prompt ?? ''),
    'Answer in the same language the user uses unless they ask otherwise.',
    'Stay within the scope of this workflow. Be concise and helpful.',
    toolNames.length
      ? `You can call these tools when helpful: ${toolNames.join(', ')}. Call a tool instead of guessing when it can fetch the answer.`
      : '',
    memoryCollection
      ? 'Use the retrieve_memory tool to ground answers in stored knowledge when relevant.'
      : '',
    ragSnippets.length
      ? `Relevant context from memory:\n${ragSnippets.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const modelMessages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: workersAI(modelId as never),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: Number(data.maxTokens ?? 1024) || 1024,
    tools: toolNames.length ? tools : undefined,
    stopWhen: toolNames.length ? stepCountIs(5) : undefined,
    onFinish: async ({ usage }) => {
      try {
        const aiResponse = usage ? { usage } : { response: latestUser };
        await billAgentUsage(c.env, bindingName, userDO, user.identifier, service, {
          endpoint,
          aiResponse,
          userAgent: c.req.header('user-agent'),
          ipAddress: c.req.header('cf-connecting-ip') ?? undefined,
          workflowAttribution: attr,
        });
      } catch (e) {
        console.error('[workflow-chat] billing failed:', e);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
