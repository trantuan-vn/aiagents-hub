import { tool, ToolLoopAgent, type ToolSet } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import {
  billAgentUsage,
  ensureWalletBalance,
  resolveServiceByEndpoint,
} from '../member/workflows/billing/billing';
import { createApiKeyTool } from './tools/create-api-key-tool';
import { createPaymentUrlTool } from './tools/create-payment-url-tool';
import { createOrderTool } from './tools/create-order-tool';
import { cancelOrderTool } from './tools/cancel-order-tool';
import { getAvailableVouchersTool } from './tools/get-available-vouchers-tool';
import { getOrderDetailTool } from './tools/get-order-detail-tool';
import { getOrdersTool } from './tools/get-orders-tool';
import { getPaymentMethodsTool } from './tools/get-payment-methods-tool';
import { getServicesTool } from './tools/get-services-tool';
import { getOverviewTool } from './tools/get-overview-tool';
import { getMonitorLogsTool } from './tools/get-monitor-logs-tool';
import { getMonitorAnalyticsTool } from './tools/get-monitor-analytics-tool';
import { getReferralCommissionsTool } from './tools/get-referral-commissions-tool';
import { getReferralCommissionStatsTool } from './tools/get-referral-commission-stats-tool';
import { getReferralLinkTool } from './tools/get-referral-link-tool';
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
  requiresConfirmation: boolean;
};

const CONFIRM_APPROVE_TOKEN = '__assistant_confirm_ok__';
const CONFIRM_REQUIRED_TOKEN = '__assistant_confirm_required__';
const CONFIRM_SEPARATOR = '::';

const AI_GATEWAY_ID = 'unitoken';

/** Service endpoint + model for dashboard assistant chat billing (register matching service in dashboard). */
export const ASSISTANT_CHAT_SERVICE = {
  endpoint: '/dashboard/assistant/chat',
  model: '@cf/zai-org/glm-4.7-flash',
} as const;

const TOOL_CONFIGS: AssistantToolConfig[] = [
  {
    name: 'createApiKey',
    roles: ['member'],
    factory: createApiKeyTool,
    requiresConfirmation: true,
  },
  {
    name: 'listApiKeys',
    roles: ['member'],
    factory: listApiKeysTool,
    requiresConfirmation: false,
  },
  {
    name: 'revokeApiKey',
    roles: ['member'],
    factory: revokeApiKeyTool,
    requiresConfirmation: true,
  },
  {
    name: 'revokeAllApiKeys',
    roles: ['member'],
    factory: revokeAllApiKeysTool,
    requiresConfirmation: true,
  },
  {
    name: 'createOrder',
    roles: ['member'],
    factory: createOrderTool,
    requiresConfirmation: true,
  },
  {
    name: 'getOrders',
    roles: ['member'],
    factory: getOrdersTool,
    requiresConfirmation: false,
  },
  {
    name: 'getOrderDetail',
    roles: ['member'],
    factory: getOrderDetailTool,
    requiresConfirmation: false,
  },
  {
    name: 'cancelOrder',
    roles: ['member'],
    factory: cancelOrderTool,
    requiresConfirmation: true,
  },
  {
    name: 'getServices',
    roles: ['member'],
    factory: getServicesTool,
    requiresConfirmation: false,
  },
  {
    name: 'getAvailableVouchers',
    roles: ['member'],
    factory: getAvailableVouchersTool,
    requiresConfirmation: false,
  },
  {
    name: 'getPaymentMethods',
    roles: ['member'],
    factory: (_c, _bindingName, _user) => getPaymentMethodsTool(),
    requiresConfirmation: false,
  },
  {
    name: 'createPaymentUrl',
    roles: ['member'],
    factory: createPaymentUrlTool,
    requiresConfirmation: true,
  },
  {
    name: 'queryPaymentTransaction',
    roles: ['member'],
    factory: queryPaymentTransactionTool,
    requiresConfirmation: false,
  },
  {
    name: 'refundPayment',
    roles: ['member'],
    factory: refundPaymentTool,
    requiresConfirmation: true,
  },
  {
    name: 'getOverview',
    roles: ['member'],
    factory: getOverviewTool,
    requiresConfirmation: false,
  },
  {
    name: 'getMonitorLogs',
    roles: ['member'],
    factory: getMonitorLogsTool,
    requiresConfirmation: false,
  },
  {
    name: 'getMonitorAnalytics',
    roles: ['member'],
    factory: getMonitorAnalyticsTool,
    requiresConfirmation: false,
  },
  {
    name: 'getReferralLink',
    roles: ['member'],
    factory: getReferralLinkTool,
    requiresConfirmation: false,
  },
  {
    name: 'getReferralCommissionStats',
    roles: ['member'],
    factory: getReferralCommissionStatsTool,
    requiresConfirmation: false,
  },
  {
    name: 'getReferralCommissions',
    roles: ['member'],
    factory: getReferralCommissionsTool,
    requiresConfirmation: false,
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
  if (!role) return false;
  if (role === 'admin' && config.roles.includes('member')) return true;
  return config.roles.includes(role);
}

function buildToolset(c: any, bindingName: string, user: any, latestUserMessageText: string): ToolSet {
  return TOOL_CONFIGS.reduce<ToolSet>((acc, config) => {
    if (!canUseTool(config, user)) return acc;
    const baseTool = config.factory(c, bindingName, user);
    acc[config.name] = config.requiresConfirmation
      ? withUserConfirmation(baseTool, latestUserMessageText, config.name)
      : baseTool;
    return acc;
  }, {} as ToolSet);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
  return `{${entries.join(',')}}`;
}

function buildConfirmationKey(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${stableSerialize(input)}`;
}

function extractApprovedConfirmationKey(message: string): string | null {
  const normalized = message
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (normalized === CONFIRM_APPROVE_TOKEN) return '';
  const prefix = `${CONFIRM_APPROVE_TOKEN}${CONFIRM_SEPARATOR}`;
  if (!normalized.startsWith(prefix)) return null;
  return normalized.slice(prefix.length).trim();
}

function hasExplicitUserConfirmation(message: string, expectedKey: string): boolean {
  const approvedKey = extractApprovedConfirmationKey(message);
  if (approvedKey === null) return false;
  if (!approvedKey) return true; // backward compatibility for older clients sending token only.
  return approvedKey === expectedKey;
}

function withUserConfirmation(baseTool: any, latestUserMessageText: string, toolName: string) {
  return tool({
    description: `${baseTool.description}\n\nBefore executing this tool, you must present a short action summary and wait for explicit user confirmation.`,
    inputSchema: baseTool.inputSchema,
    execute: async function* executeWithConfirmation(input: Record<string, unknown>) {
      const parsedInput = baseTool.inputSchema.safeParse(input);
      if (!parsedInput.success) {
        // Let the model continue collecting missing/invalid fields from the user before asking for confirmation.
        throw new Error(`Invalid tool input: ${parsedInput.error.message}`);
      }

      const confirmationKey = buildConfirmationKey(toolName, parsedInput.data);
      if (!hasExplicitUserConfirmation(latestUserMessageText, confirmationKey)) {
        yield {
          state: 'confirmation-required' as const,
          confirmationKey,
        };
        return;
      }

      yield* baseTool.execute(parsedInput.data);
    },
  });
}

export async function createAssistantAgent(
  c: any,
  bindingName: string,
  user: any,
  latestUserMessageText = '',
) {
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
  await ensureWalletBalance(userDO);
  const service = await resolveServiceByEndpoint(userDO, ASSISTANT_CHAT_SERVICE.endpoint);

  const workersAI = createWorkersAI({
    binding: c.env.AI,
    gateway: { id: AI_GATEWAY_ID },
  });

  const tools = buildToolset(c, bindingName, user, latestUserMessageText);
  const enabledTools = Object.keys(tools);
  const modelId = ASSISTANT_CHAT_SERVICE.model;

  return new ToolLoopAgent({
    model: workersAI(modelId as never),
    onFinish: async ({ totalUsage }) => {
      try {
        await billAgentUsage(c.env, bindingName, userDO, user.identifier, service, {
          endpoint: ASSISTANT_CHAT_SERVICE.endpoint,
          aiResponse: totalUsage ? { usage: totalUsage } : {},
          userAgent: c.req?.header?.('user-agent'),
          ipAddress: c.req?.header?.('cf-connecting-ip') ?? undefined,
        });
      } catch (e) {
        console.error('[assistant] billing failed:', e);
      }
    },
    instructions: [
      'You are a friendly Unitoken assistant for the user dashboard.',
      'Use plain, everyday language that is easy to understand.',
      'Avoid technical jargon; if a technical term is necessary, explain it in one short sentence.',
      'Do not mention internal tool names, API names, bindings, or system architecture to end users.',
      'Keep answers clear and actionable, with short steps when guiding users.',
      'Only use tools that are available in the current toolset and never call unavailable capabilities.',
      'The backend already scopes tool availability per user; if a capability is missing, explain that it is not enabled for this account.',
      'If the user asks anything outside the current tool capabilities, do not answer the external topic.',
      'Instead, apologize and remind them that you can only answer questions related to the currently available tool functions.',
      'For out-of-scope questions, politely apologize and clearly state you can only help with capabilities available in the current toolset.',
      enabledTools.length
        ? `Enabled tools for this user: ${enabledTools.join(', ')}.`
        : 'No tools are enabled for this user. Reply with guidance instead of attempting tool calls.',
      'For any tool call, if required parameters are missing, first use available lookup/list tools to fetch options for the user to choose from.',
      'If lookup tools are unavailable or still insufficient, ask the user to provide the missing fields explicitly, then confirm the final payload before executing the action.',
      'Only ask for confirmation before mutation actions (create/update/delete/cancel/refund/revoke).',
      'For lookup/read-only actions (get/list/query), do not ask for confirmation and execute directly when inputs are ready.',
      `When asking for confirmation of a mutation action, append this exact marker on its own line at the end: ${CONFIRM_REQUIRED_TOKEN}`,
      'Never execute mutation actions unless the user has explicitly confirmed that specific action in their latest message.',
      'When sharing any URL (especially payment URLs), always return the complete original URL exactly as provided by tool output.',
      'Never shorten, mask, truncate, reformat, or replace any part of a URL with "...". Keep full query parameters intact.',
      'Use exactly one language consistently throughout the conversation.',
      'Set that language from the user\'s first message in the conversation unless the user explicitly asks to switch languages.',
      'Do not mix multiple languages in a single reply, except for unavoidable proper nouns, product names, URLs, or code snippets.',
      'Never invent successful API results; rely on tool outputs.',
    ].join('\n'),
    tools,
  });
}
