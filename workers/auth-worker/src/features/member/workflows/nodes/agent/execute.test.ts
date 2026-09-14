import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';

const reasoningMock = vi.hoisted(() => ({
  executeReasoningAgent: vi.fn().mockResolvedValue({ status: 'ok', text: 'reasoned' }),
}));

const billingMock = vi.hoisted(() => ({
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  resolveServiceByEndpoint: vi.fn().mockResolvedValue({ model: '@cf/meta/llama-3.1-8b-instruct' }),
  getModelForService: vi.fn().mockReturnValue('@cf/meta/llama-3.1-8b-instruct'),
  runTextModel: vi.fn().mockResolvedValue({ response: 'sql ok' }),
  extractTextFromAiResponse: vi.fn().mockReturnValue('SELECT 1;'),
  finishReasonFromAiResponse: vi.fn().mockReturnValue('stop'),
  billAgentUsage: vi.fn().mockResolvedValue(0),
}));

vi.mock('./execute-reasoning.js', () => reasoningMock);
vi.mock('../../billing/billing.js', () => billingMock);

import { executeAgent } from './execute.js';

function ctx(agentKind: string): NodeContext {
  const definition: WorkflowDefinition = {
    nodes: [
      {
        id: 'agent_1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { agentKind, prompt: 'hi', serviceEndpoint: '/svc' },
      },
      {
        id: 'svc_1',
        type: 'service_node',
        position: { x: 0, y: 0 },
        data: { endpoint: '/svc' },
      },
    ],
    edges: [{ id: 'e1', source: 'svc_1', target: 'agent_1', sourceHandle: 'service', targetHandle: 'service' }],
  };
  return {
    node: definition.nodes[0],
    nodeInput: { query: 'hi' },
    definition,
    outputs: {},
    runContext: {},
    input: 'hi',
    c: { env: {} },
    bindingName: 'USER_DO',
    user: { identifier: 'user@example.com' },
    userDO: {} as NodeContext['userDO'],
    meta: { ownerId: 'o', workflowId: 1, isOwnedByUser: true, workflowName: 'wf' },
  };
}

describe('executeAgent dispatcher', () => {
  beforeEach(() => {
    reasoningMock.executeReasoningAgent.mockClear();
    billingMock.runTextModel.mockClear();
  });

  it('keeps tools_agent on the original generate path', async () => {
    const out = await executeAgent(ctx('tools_agent'));
    expect(reasoningMock.executeReasoningAgent).not.toHaveBeenCalled();
    expect(billingMock.runTextModel).toHaveBeenCalled();
    expect(out.text).toBe('SELECT 1;');
  });

  it('routes reasoning_agent to the governed controller', async () => {
    const out = await executeAgent(ctx('reasoning_agent'));
    expect(reasoningMock.executeReasoningAgent).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: 'ok', text: 'reasoned' });
    expect(billingMock.runTextModel).not.toHaveBeenCalled();
  });
});
