import { ToolLoopAgent } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { createApiKeyTool } from './tools/create-api-key-tool';
import { createOrderTool } from './tools/create-order-tool';

export function createAssistantAgent(c: any, bindingName: string, user: any) {
  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: { id: 'unitoken' },
  });

  return new ToolLoopAgent({
    model: workersAI('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
    instructions: [
      'You are a concise assistant for the Unitoken dashboard.',
      'You can create API keys and create orders by calling the provided tools when the user asks.',
      'Before creating an order, confirm service IDs and prices if the user did not provide them.',
      'Respond in the same language as the user (Vietnamese or English).',
      'Never invent successful API results; rely on tool outputs.',
    ].join('\n'),
    tools: {
      createApiKey: createApiKeyTool(c, bindingName, user),
      createOrder: createOrderTool(c, bindingName, user),
    },
  });
}
