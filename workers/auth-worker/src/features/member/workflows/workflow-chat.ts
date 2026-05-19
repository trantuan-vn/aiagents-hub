import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { getIdFromName } from '../../../shared/utils.js';
import { UserDO } from '../../ws/infrastructure/UserDO.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  getModelForService,
  resolveServiceByEndpoint,
} from './billing.js';
import type { ResolvedWorkflow } from './workflow-context.js';
import { findPrimaryAgentNode, workflowAttribution } from './workflow-context.js';

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
  const systemPrompt = [
    `You are the conversational agent for the "${wfName}" workflow.`,
    wfDesc ? `Workflow description: ${wfDesc}` : '',
    String(data.systemPrompt ?? data.prompt ?? ''),
    'Answer in the same language the user uses unless they ask otherwise.',
    'Stay within the scope of this workflow. Be concise and helpful.',
    data.memoryCollection
      ? `Long-term memory is stored in vector collection "${data.memoryCollection}".`
      : '',
    Array.isArray(data.tools) && data.tools.length
      ? `Configured tools: ${JSON.stringify(data.tools)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const modelMessages = await convertToModelMessages(uiMessages);
  const latestUser = extractLatestUserText(uiMessages);

  const result = streamText({
    model: workersAI(modelId as never),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: Number(data.maxTokens ?? 1024) || 1024,
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
