import { describe, expect, it, vi } from 'vitest';

vi.mock('@cloudflare/codemode', () => ({
  DynamicWorkerExecutor: class {
    constructor(_opts: unknown) {}
  },
}));
vi.mock('@cloudflare/codemode/ai', () => ({
  createCodeTool: () => ({
    description: 'mock codemode',
    execute: async () => ({ result: null, logs: [] }),
  }),
}));
vi.mock('../../../../../ws/infrastructure/UserDO', () => ({
  UserDO: class UserDO {},
}));

import type { WorkflowDefinition } from '../../../domain/domain.js';
import { buildLinkedAgentTools } from '../../../execution/agent-runtime.js';
import { CONFIRM_APPROVE_TOKEN } from '../../../../../assistant/confirmation.js';
import { isVerifiedAdminSession } from '../../../../../assistant/admin-access.js';

const definition: WorkflowDefinition = {
  nodes: [
    { id: 'agent', type: 'agent', position: { x: 0, y: 0 }, data: { agentKind: 'tools_agent' } },
    { id: 'actions', type: 'tool_node', position: { x: 0, y: 80 }, data: { toolKind: 'member_actions' } },
  ],
  edges: [{ id: 'e1', source: 'actions', target: 'agent', sourceHandle: 'tools', targetHandle: 'tools' }],
};

async function collect(tool: { execute: (input: unknown, options: unknown) => AsyncIterable<unknown> | Promise<unknown> }, input: unknown) {
  const result = await tool.execute(input, { toolCallId: 'call', messages: [] });
  if (result && typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    const chunks: unknown[] = [];
    for await (const chunk of result as AsyncIterable<unknown>) chunks.push(chunk);
    return chunks;
  }
  return [result];
}

describe('member_actions tools', () => {
  it('registers dashboard read and write tools for the workflow runner', () => {
    const tools = buildLinkedAgentTools(
      {
        env: {} as Env,
        userDO: {} as DurableObjectStub<any>,
        c: {},
        bindingName: 'USER_DO',
        user: { identifier: 'user@example.com' },
        triggerContext: { chatInput: 'list my keys' },
      },
      definition,
      'agent',
    );

    expect(Object.keys(tools).sort()).toEqual(
      [
        'cancelOrder',
        'createApiKey',
        'createOrder',
        'createPaymentUrl',
        'getAvailableVouchers',
        'getMonitorAnalytics',
        'getMonitorLogs',
        'getOrderDetail',
        'getOrders',
        'getOverview',
        'getPaymentMethods',
        'getReferralCommissionStats',
        'getReferralCommissions',
        'getReferralLink',
        'getServices',
        'listApiKeys',
        'queryPaymentTransaction',
        'refundPayment',
        'revokeAllApiKeys',
        'revokeApiKey',
      ].sort(),
    );
  });

  it('does not create an API key until the user confirms that payload', async () => {
    const tools = buildLinkedAgentTools(
      {
        env: {} as Env,
        userDO: {} as DurableObjectStub<any>,
        c: {},
        bindingName: 'USER_DO',
        user: { identifier: 'user@example.com' },
        triggerContext: { chatInput: 'please create a key named ci' },
      },
      definition,
      'agent',
    );

    const blocked = await collect(tools.createApiKey as never, { name: 'ci' });
    expect(blocked[0]).toMatchObject({ state: 'confirmation-required' });

    const confirmed = buildLinkedAgentTools(
      {
        env: {} as Env,
        userDO: {} as DurableObjectStub<any>,
        c: { env: {} },
        bindingName: 'USER_DO',
        user: { identifier: 'user@example.com' },
        triggerContext: { chatInput: CONFIRM_APPROVE_TOKEN },
      },
      definition,
      'agent',
    );
    const ran = await collect(confirmed.createApiKey as never, { name: 'ci' });
    expect(ran.some((chunk) => (chunk as { state?: string }).state === 'confirmation-required')).toBe(false);
    expect(ran.at(-1)).toMatchObject({ state: 'ready', ok: false });
  });

  it('keeps admin tools off the billing actor and on the verified admin session', async () => {
    expect(isVerifiedAdminSession({ ADMIN_IDENTIFIERS: 'admin@example.com' } as Env, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);

    const asBillingAdmin = buildLinkedAgentTools(
      {
        env: { ADMIN_IDENTIFIERS: 'admin@example.com' } as Env,
        userDO: {} as DurableObjectStub<any>,
        c: {},
        bindingName: 'USER_DO',
        user: { identifier: 'admin@example.com' },
        sessionIdentifier: 'member@example.com',
        triggerContext: { chatInput: 'what can you do' },
      },
      definition,
      'agent',
    );
    expect(asBillingAdmin.adminGetDashboardStats).toBeUndefined();
    expect(asBillingAdmin.adminGrantPlan).toBeUndefined();

    const asAdminSession = buildLinkedAgentTools(
      {
        env: { ADMIN_IDENTIFIERS: 'admin@example.com' } as Env,
        userDO: {} as DurableObjectStub<any>,
        c: {},
        bindingName: 'USER_DO',
        user: { identifier: 'member@example.com' },
        sessionIdentifier: 'admin@example.com',
        triggerContext: { chatInput: 'grant pro' },
      },
      definition,
      'agent',
    );
    expect(asAdminSession.getOverview).toBeDefined();
    expect(asAdminSession.adminGetDashboardStats).toBeDefined();
    expect(asAdminSession.adminListEnterprises).toBeDefined();
    expect(asAdminSession.adminGrantPlan).toBeDefined();

    const blocked = await collect(asAdminSession.adminGrantPlan as never, {
      email: 'user@example.com',
      planId: 'pro',
      reason: 'support',
    });
    expect(blocked[0]).toMatchObject({ state: 'confirmation-required' });
  });
});
