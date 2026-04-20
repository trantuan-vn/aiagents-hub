import { ToolLoopAgent, type ToolSet } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { createApiKeyTool } from './tools/create-api-key-tool';
import { createPaymentUrlTool } from './tools/create-payment-url-tool';
import { createOrderTool } from './tools/create-order-tool';
import { cancelOrderTool } from './tools/cancel-order-tool';
import { getAvailableVouchersTool } from './tools/get-available-vouchers-tool';
import { getOrderDetailTool } from './tools/get-order-detail-tool';
import { getOrdersTool } from './tools/get-orders-tool';
import { getPaymentMethodsTool } from './tools/get-payment-methods-tool';
import { getServicesTool } from './tools/get-services-tool';
import { listApiKeysTool } from './tools/list-api-keys-tool';
import { queryPaymentTransactionTool } from './tools/query-payment-transaction-tool';
import { refundPaymentTool } from './tools/refund-payment-tool';
import { revokeAllApiKeysTool } from './tools/revoke-all-api-keys-tool';
import { revokeApiKeyTool } from './tools/revoke-api-key-tool';

type ToolFactory = (c: any, bindingName: string, user: any) => any;
type UserRole = 'member' | 'admin';

type AssistantToolConfig = {
  name: string;
  roles: UserRole[];
  factory: ToolFactory;
};

const TOOL_CONFIGS: AssistantToolConfig[] = [
  {
    name: 'createApiKey',
    roles: ['member'],
    factory: createApiKeyTool,
  },
  {
    name: 'listApiKeys',
    roles: ['member'],
    factory: listApiKeysTool,
  },
  {
    name: 'revokeApiKey',
    roles: ['member'],
    factory: revokeApiKeyTool,
  },
  {
    name: 'revokeAllApiKeys',
    roles: ['member'],
    factory: revokeAllApiKeysTool,
  },
  {
    name: 'createOrder',
    roles: ['member'],
    factory: createOrderTool,
  },
  {
    name: 'getOrders',
    roles: ['member'],
    factory: getOrdersTool,
  },
  {
    name: 'getOrderDetail',
    roles: ['member'],
    factory: getOrderDetailTool,
  },
  {
    name: 'cancelOrder',
    roles: ['member'],
    factory: cancelOrderTool,
  },
  {
    name: 'getServices',
    roles: ['member'],
    factory: getServicesTool,
  },
  {
    name: 'getAvailableVouchers',
    roles: ['member'],
    factory: getAvailableVouchersTool,
  },
  {
    name: 'getPaymentMethods',
    roles: ['member'],
    factory: (_c, _bindingName, _user) => getPaymentMethodsTool(),
  },
  {
    name: 'createPaymentUrl',
    roles: ['member'],
    factory: createPaymentUrlTool,
  },
  {
    name: 'queryPaymentTransaction',
    roles: ['member'],
    factory: queryPaymentTransactionTool,
  },
  {
    name: 'refundPayment',
    roles: ['member'],
    factory: refundPaymentTool,
  },
];

function toUserRole(role: unknown): UserRole | undefined {
  if (role === 'member' || role === 'admin') return role;
  if (typeof role !== 'string') return undefined;
  const normalized = role.toLowerCase();
  if (normalized === 'member' || normalized === 'admin') return normalized;
  return undefined;
}

function collectUserScopes(user: any) {
  const role = toUserRole(user?.role);

  return { role };
}

function canUseTool(config: AssistantToolConfig, user: any): boolean {
  const { role } = collectUserScopes(user);
  if (!role || !config.roles.includes(role)) {
    return false;
  }
  return true;
}

function buildToolset(c: any, bindingName: string, user: any): ToolSet {
  return TOOL_CONFIGS.reduce<ToolSet>((acc, config) => {
    if (!canUseTool(config, user)) return acc;
    acc[config.name] = config.factory(c, bindingName, user);
    return acc;
  }, {} as ToolSet);
}

export function createAssistantAgent(c: any, bindingName: string, user: any) {
  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: { id: 'unitoken' },
  });

  const tools = buildToolset(c, bindingName, user);
  const enabledTools = Object.keys(tools);

  return new ToolLoopAgent({
    // model: workersAI('@cf/moonshotai/kimi-k2.5'),
    model: workersAI('@cf/zai-org/glm-4.7-flash'),
    instructions: [
      'You are a concise assistant for the Unitoken dashboard.',
      'Only use tools that are available in the current toolset and never call unavailable capabilities.',
      'The backend already scopes tool availability per user; if a capability is missing, explain that it is not enabled for this account.',
      enabledTools.length
        ? `Enabled tools for this user: ${enabledTools.join(', ')}.`
        : 'No tools are enabled for this user. Reply with guidance instead of attempting tool calls.',
      'For any tool call, if required parameters are missing, first use available lookup/list tools to fetch options for the user to choose from.',
      'If lookup tools are unavailable or still insufficient, ask the user to provide the missing fields explicitly, then confirm the final payload before executing the action.',
      'Respond in the same language as the user (Vietnamese or English).',
      'Never invent successful API results; rely on tool outputs.',
    ].join('\n'),
    tools,
  });
}
