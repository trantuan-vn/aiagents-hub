import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { executeReasoningAgent, type ReasoningLlmCall } from './execute-reasoning.js';
import { isReasoningAgentKind } from './shared.js';

vi.mock('../../../billing/billing.js', () => ({
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  resolveServiceByEndpoint: vi.fn().mockResolvedValue({ model: '@cf/meta/llama-3.1-8b-instruct' }),
  getModelForService: vi.fn().mockReturnValue('@cf/meta/llama-3.1-8b-instruct'),
  runTextModel: vi.fn(),
  extractTextFromAiResponse: vi.fn(),
  billAgentUsage: vi.fn().mockResolvedValue(0),
}));

function ctx(data: Record<string, unknown>, input: Record<string, unknown> = {}): NodeContext {
  const definition: WorkflowDefinition = {
    nodes: [{ id: 'agent_1', type: 'agent', position: { x: 0, y: 0 }, data }],
    edges: [],
  };
  return {
    node: definition.nodes[0],
    nodeInput: input,
    definition,
    outputs: {},
    runContext: { sessionId: 'sess-1' },
    input: String(input.query ?? ''),
    c: { env: {} },
    bindingName: 'USER_DO',
    user: { identifier: 'user@example.com' },
    userDO: {} as NodeContext['userDO'],
    meta: {
      ownerId: 'owner',
      workflowId: 1,
      isOwnedByUser: true,
      workflowName: 'wf',
    },
  };
}

describe('executeReasoningAgent', () => {
  it('refuses dangerous requests without calling the LLM', async () => {
    const llm = vi.fn() as unknown as ReasoningLlmCall;
    const out = await executeReasoningAgent(
      ctx(
        { agentKind: 'reasoning_agent', prompt: 'how to make a bomb', promptSource: 'define_below' },
        { query: 'how to make a bomb' },
      ),
      { llm },
    );
    expect(out.status).toBe('refused');
    expect(out.category).toBe('illegal');
    expect(llm).not.toHaveBeenCalled();
  });

  it('asks for clarification when the request is empty', async () => {
    const llm = vi.fn() as unknown as ReasoningLlmCall;
    const out = await executeReasoningAgent(
      ctx({ agentKind: 'reasoning_agent', prompt: '', clarificationMode: 'ask' }, { query: '' }),
      { llm },
    );
    expect(out.status).toBe('needs_clarification');
    expect(Array.isArray(out.questions)).toBe(true);
    expect(llm).not.toHaveBeenCalled();
  });

  it('does not crash when the act model returns empty text and a tool result is missing', async () => {
    const llm: ReasoningLlmCall = async ({ purpose }) => {
      if (purpose === 'act') {
        return {
          text: undefined as unknown as string,
          observations: [{ tool: 'get_rag', ok: true, output: undefined as unknown as string }],
        };
      }
      return {
        text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":true,"confidence":0.9}',
        observations: [],
      };
    };
    const out = await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'thông tin số dư của NĐT',
          requireCitations: true,
          enablePlanner: 'off',
          maxReflectRetries: 0,
        },
        { chatInput: 'thông tin số dư của NĐT', query: 'thông tin số dư của NĐT' },
      ),
      { llm },
    );
    expect(out.status).toBe('ok');
    expect(typeof out.text).toBe('string');
    expect(out.sql).toBe('');
  });

  it('returns citations on a successful grounded answer', async () => {
    const llm: ReasoningLlmCall = async ({ purpose }) => {
      if (purpose === 'act') {
        return { text: 'Orders use id and total [1].', observations: [] };
      }
      return { text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":false,"confidence":0.9}', observations: [] };
    };
    const out = await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'What columns does orders have?',
          requireCitations: true,
          enablePlanner: 'off',
          maxReflectRetries: 0,
        },
        { query: 'What columns does orders have?', snippets: ['orders(id, total)'] },
      ),
      { llm },
    );
    expect(out.status).toBe('ok');
    expect(String(out.text)).toContain('[1]');
    expect(Array.isArray(out.citations) && (out.citations as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('kind routing', () => {
  it('only treats reasoning_agent as the governed kind', () => {
    expect(isReasoningAgentKind({ agentKind: 'tools_agent' })).toBe(false);
    expect(isReasoningAgentKind({ agentKind: 'reasoning_agent' })).toBe(true);
    expect(isReasoningAgentKind({})).toBe(false);
  });
});
