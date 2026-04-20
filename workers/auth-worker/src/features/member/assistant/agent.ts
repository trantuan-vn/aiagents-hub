import { ToolLoopAgent } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { createApiKeyTool } from './tools/create-api-key-tool';
import { createOrderTool } from './tools/create-order-tool';
import { getAvailableVouchersTool } from './tools/get-available-vouchers-tool';
import { getPaymentMethodsTool } from './tools/get-payment-methods-tool';
import { getServicesTool } from './tools/get-services-tool';

export function createAssistantAgent(c: any, bindingName: string, user: any) {
  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: { id: 'unitoken' },
  });

  return new ToolLoopAgent({
    // model: workersAI('@cf/moonshotai/kimi-k2.5'),
    model: workersAI('@cf/zai-org/glm-4.7-flash'),
    instructions: [
      'You are a concise assistant for the Unitoken dashboard.',
      'You can create API keys and create orders by calling the provided tools when the user asks.',
      'Before creating an order, if required information is missing, call lookup tools to fetch services, vouchers, and payment methods for the user.',
      'Confirm final serviceId, basePrice, quantity, optional voucherCode, and optional paymentMethod before calling createOrder.',
      'Respond in the same language as the user (Vietnamese or English).',
      'Never invent successful API results; rely on tool outputs.',
    ].join('\n'),
    tools: {
      createApiKey: createApiKeyTool(c, bindingName, user),
      createOrder: createOrderTool(c, bindingName, user),
      getServices: getServicesTool(c, bindingName, user),
      getAvailableVouchers: getAvailableVouchersTool(c, bindingName, user),
      getPaymentMethods: getPaymentMethodsTool(),
    },
  });
}
