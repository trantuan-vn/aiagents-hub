import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type UIMessage } from 'ai';
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
import { attachSimpleMemory, isLinkedSimpleMemory } from '../nodes/memory-node/simple.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  getModelForService,
  resolveServiceByEndpoint,
} from '../billing/billing.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { findPrimaryAgentNode, workflowAttribution } from '../execution/workflow-context.js';
import { WORKERS_AI_GATEWAY } from '../ai/workers-ai.js';
import { executeReasoningAgent } from '../nodes/agent/execute-reasoning.js';
import { isReasoningAgentKind } from '../nodes/agent/shared.js';
import type { NodeContext } from '../nodes/types.js';

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

function textToUiStreamResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'text-start', id: 'reasoning' });
      writer.write({ type: 'text-delta', id: 'reasoning', delta: text });
      writer.write({ type: 'text-end', id: 'reasoning' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

async function createReasoningChatResponse(
  c: any,
  bindingName: string,
  user: { identifier: string },
  resolved: ResolvedWorkflow,
  agentNode: NonNullable<ReturnType<typeof findPrimaryAgentNode>>,
  uiMessages: UIMessage[],
): Promise<Response> {
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
  const latestUser = extractLatestUserText(uiMessages);
  const sessionId = `chat:${resolved.workflowId}:${user.identifier}`.slice(0, 80);
  const ctx: NodeContext = {
    node: agentNode,
    nodeInput: { chatInput: latestUser, query: latestUser, sessionId, messages: uiMessages },
    definition: resolved.definition,
    outputs: {},
    runContext: { sessionId, chatInput: latestUser },
    input: latestUser,
    c,
    bindingName,
    user,
    userDO,
    meta: {
      ownerId: resolved.ownerId,
      workflowId: resolved.workflowId,
      isOwnedByUser: resolved.isOwnedByUser,
      workflowName: String(resolved.workflow.name ?? ''),
      workflowDescription: String(resolved.workflow.description ?? ''),
    },
    attr: workflowAttribution(resolved),
    requestMeta: {
      userAgent: c.req.header('user-agent') ?? undefined,
      ipAddress: c.req.header('cf-connecting-ip') ?? undefined,
    },
  };
  const output = await executeReasoningAgent(ctx);
  return textToUiStreamResponse(String(output.text ?? ''));
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
  if (isReasoningAgentKind(data)) {
    return createReasoningChatResponse(c, bindingName, user, resolved, agentNode, uiMessages);
  }

  const endpoint = String(data.serviceEndpoint ?? data.endpoint ?? '').trim();
  if (!endpoint) {
    throw new Error('Agent node is missing serviceEndpoint');
  }

  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
  await ensureWalletBalance(userDO, c.env);
  const service = await resolveServiceByEndpoint(userDO, endpoint);
  const modelId = getModelForService(service);
  const attr = workflowAttribution(resolved);

  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: WORKERS_AI_GATEWAY,
  });

  const wfName = String(resolved.workflow.name ?? 'Workflow');
  const wfDesc = String(resolved.workflow.description ?? '');
  const latestUser = extractLatestUserText(uiMessages);

  const linked = resolveAgentResources(resolved.definition, agentNode.id, {
    ownerId: resolved.ownerId,
    workflowId: resolved.workflowId,
  });
  const simpleMemoryLinked = isLinkedSimpleMemory(linked);
  const memoryCollection = simpleMemoryLinked
    ? ''
    : String(data.memoryCollection ?? linked.memoryCollection ?? '').trim();
  const memoryNamespace = String(linked.memoryNamespace ?? '').trim();
  const chatSessionId = `chat:${resolved.workflowId}:${user.identifier}`.slice(0, 80);
  const simpleMemory = simpleMemoryLinked
    ? await attachSimpleMemory(
        {
          node: agentNode,
          nodeInput: { chatInput: latestUser, query: latestUser, sessionId: chatSessionId },
          definition: resolved.definition,
          outputs: {},
          runContext: { sessionId: chatSessionId, chatInput: latestUser },
          input: latestUser,
          c,
          bindingName,
          user,
          userDO,
          meta: {
            ownerId: resolved.ownerId,
            workflowId: resolved.workflowId,
            isOwnedByUser: resolved.isOwnedByUser,
            workflowName: wfName,
            workflowDescription: wfDesc,
          },
          attr,
        },
        linked,
        latestUser,
      )
    : { history: [], historyText: '', persist: async () => undefined };
  const hasGetRagTool = agentHasRagToolKind(resolved.definition, agentNode.id, 'get-rag');
  const httpTools = buildAgentToolset({ env: c.env, userDO }, resolved.definition);
  const ragTools = buildRagToolset(
    {
      env: c.env,
      userDO,
      ownerId: resolved.ownerId,
      workflowId: resolved.workflowId,
      billing: {
        env: c.env,
        bindingName,
        userDO,
        consumerIdentifier: user.identifier,
        requestMeta: {
          userAgent: c.req.header('user-agent') ?? undefined,
          ipAddress: c.req.header('cf-connecting-ip') ?? undefined,
        },
        workflowAttribution: attr,
      },
    },
    resolved.definition,
    agentNode.id,
  );
  const memoryTools =
    memoryCollection && !hasGetRagTool && !Object.keys(ragTools).length
      ? buildMemoryTool(c.env, memoryCollection, memoryNamespace || undefined)
      : {};
  const tools = { ...httpTools, ...ragTools, ...memoryTools };
  const toolNames = Object.keys(tools);

  const ragSnippets =
    memoryCollection && !hasGetRagTool
      ? await retrieveMemory(c.env, memoryCollection, latestUser, 4, memoryNamespace || undefined)
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

  const modelMessages = simpleMemoryLinked
    ? [
        ...simpleMemory.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: latestUser },
      ]
    : await convertToModelMessages(uiMessages);

  const result = streamText({
    model: workersAI(modelId as never),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: Number(data.maxTokens ?? 1024) || 1024,
    tools: toolNames.length ? tools : undefined,
    stopWhen: toolNames.length ? stepCountIs(5) : undefined,
    onFinish: async ({ usage, text }) => {
      try {
        await simpleMemory.persist(text ?? '');
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
