import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { executeReasoningAgent, readReasoningOptions, type ReasoningLlmCall } from './execute-reasoning.js';
import { isReasoningAgentKind } from './shared.js';

vi.mock('../../../billing/billing.js', () => ({
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  resolveServiceByEndpoint: vi.fn().mockResolvedValue({ model: '@cf/meta/llama-3.1-8b-instruct' }),
  getModelForService: vi.fn().mockReturnValue('@cf/meta/llama-3.1-8b-instruct'),
  runTextModel: vi.fn(),
  extractTextFromAiResponse: vi.fn(),
  billAgentUsage: vi.fn().mockResolvedValue(0),
  asBillingAiResponse: (usage: unknown, fallbackText = '') =>
    usage != null && typeof usage === 'object' ? usage : { response: fallbackText },
  billGenerateTextCalls: vi.fn().mockResolvedValue(undefined),
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

  it('puts full retrieved schema and sample rows into the act prompt', async () => {
    const llm = vi.fn(async ({ purpose, system }) => {
      if (purpose === 'act') {
        expect(String(system)).toContain('CREATE TABLE ADMIN.CHUNG_KHOAN');
        expect(String(system)).toContain('"MA_CK": "VIC"');
        return { text: 'Use ADMIN.CHUNG_KHOAN [1].', observations: [] };
      }
      return { text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":false,"confidence":0.9}', observations: [] };
    }) as unknown as ReasoningLlmCall;
    await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'liet ke co phieu',
          requireCitations: true,
          enablePlanner: 'off',
          maxReflectRetries: 0,
        },
        {
          query: 'liet ke co phieu',
          snippets: [
            '# CHUNG_KHOAN\n\n## schema\nCREATE TABLE ADMIN.CHUNG_KHOAN (MA_CK VARCHAR2(20));\n```json\n[{ "MA_CK": "VIC" }]\n```',
          ],
        },
      ),
      { llm },
    );
    expect(llm).toHaveBeenCalled();
  });

  it('keeps the best draft when a later act gets worse', async () => {
    let acts = 0;
    const llm: ReasoningLlmCall = async ({ purpose }) => {
      if (purpose === 'act') {
        acts += 1;
        if (acts === 1) return { text: 'Need the schema [1].', observations: [] };
        if (acts === 2) {
          return {
            text: 'Join accounts to holders for the balance. See CREATE TABLE details [1]. The columns include MA_NDT and SO_DU in the retrieved schema block.',
            observations: [],
          };
        }
        return { text: 'No. [1]', observations: [] };
      }
      if (purpose === 'reflect') {
        return { text: '{"pass":false,"issues":["missing_sql"],"rewritten":""}', observations: [] };
      }
      return { text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":false,"confidence":0.9}', observations: [] };
    };
    const out = await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'so du nha dau tu',
          requireCitations: true,
          enablePlanner: 'off',
          clarificationMode: 'best_effort',
          maxReflectRetries: 2,
        },
        {
          query: 'so du nha dau tu',
          snippets: ['# T\n\n## schema\nCREATE TABLE t (id text);\n```json\n[{ "id": "1" }]\n```'],
        },
      ),
      { llm },
    );
    expect(out.status).toBe('ok');
    expect(String(out.text)).toContain('Join accounts');
    expect(String(out.text)).not.toBe('No. [1]');
    expect(acts).toBe(3);
  });

  it('stops after a complete SQL draft instead of burning remaining retries', async () => {
    let acts = 0;
    const llm: ReasoningLlmCall = async ({ purpose }) => {
      if (purpose === 'act') {
        acts += 1;
        if (acts === 1) return { text: 'Need schema [1].', observations: [] };
        return {
          text: '```sql\nSELECT id FROM orders WHERE id IS NOT NULL\n``` [1]',
          observations: [],
        };
      }
      if (purpose === 'reflect') {
        return { text: '{"pass":false,"issues":["missing_sql"],"rewritten":""}', observations: [] };
      }
      return { text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":false,"confidence":0.9}', observations: [] };
    };
    const out = await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'write sql',
          requireCitations: true,
          enablePlanner: 'off',
          clarificationMode: 'best_effort',
          maxReflectRetries: 6,
          noImprovementLimit: 1,
        },
        {
          query: 'write a select for orders',
          snippets: ['CREATE TABLE orders (id text)'],
        },
      ),
      { llm },
    );
    expect(String(out.sql)).toMatch(/SELECT id FROM orders/i);
    expect(acts).toBe(3);
  });

  it('uses panel Reflection retries, including a mapped INPUT expression', async () => {
    expect(
      readReasoningOptions(
        {
          maxReflectRetries: 2,
          clarificationMode: 'ask',
          requireCitations: true,
          enablePlanner: 'auto',
          safetyLevel: 'strict',
        },
        {},
      ),
    ).toMatchObject({
      maxReflectRetries: 2,
      clarificationMode: 'ask',
      requireCitations: true,
      enablePlanner: 'auto',
      safetyLevel: 'strict',
    });
    expect(
      readReasoningOptions({ maxReflectRetries: '{{ $json.retries }}' }, { retries: 0 }),
    ).toMatchObject({ maxReflectRetries: 0 });
    expect(readReasoningOptions({}, {}).maxReflectRetries).toBe(4);

    let acts = 0;
    const llm: ReasoningLlmCall = async ({ purpose }) => {
      if (purpose === 'act') {
        acts += 1;
        return { text: 'Need schema [1].', observations: [] };
      }
      if (purpose === 'reflect') {
        return { text: '{"pass":false,"issues":["missing_sql"],"rewritten":""}', observations: [] };
      }
      return { text: '{"pass":true,"issues":[],"missingSlots":[],"canUseTools":false,"confidence":0.9}', observations: [] };
    };
    await executeReasoningAgent(
      ctx(
        {
          agentKind: 'reasoning_agent',
          prompt: 'sql please',
          requireCitations: true,
          enablePlanner: 'off',
          clarificationMode: 'best_effort',
          maxReflectRetries: '{{ $json.retries }}',
        },
        {
          query: 'sql please',
          retries: 0,
          snippets: ['CREATE TABLE t (id text)'],
        },
      ),
      { llm },
    );
    expect(acts).toBe(1);
  });
});

describe('kind routing', () => {
  it('only treats reasoning_agent as the governed kind', () => {
    expect(isReasoningAgentKind({ agentKind: 'tools_agent' })).toBe(false);
    expect(isReasoningAgentKind({ agentKind: 'reasoning_agent' })).toBe(true);
    expect(isReasoningAgentKind({})).toBe(false);
  });
});
