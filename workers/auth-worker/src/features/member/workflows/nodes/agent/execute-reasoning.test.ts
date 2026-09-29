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

function codeModeCtx(data: Record<string, unknown>, input: Record<string, unknown> = {}) {
  const base = ctx(
    { agentKind: 'reasoning_agent', prompt: 'doanh thu theo tháng', enablePlanner: 'on', ...data },
    { ragText: 'schema', query: 'doanh thu theo tháng', snippets: ['schema'], ...input },
  );
  base.c = { env: { LOADER: {} } } as NodeContext['c'];
  base.definition = {
    nodes: [
      base.node,
      { id: 'rag', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-rag', toolName: 'get_rag' } },
      { id: 'sql', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'check-sql', toolName: 'check_sql' } },
      { id: 'code', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'code', toolName: 'codemode' } },
    ],
    edges: [
      { id: 'e1', source: 'rag', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
      { id: 'e2', source: 'sql', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
      { id: 'e3', source: 'code', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
    ],
  };
  return base;
}

describe('code mode phase 1', () => {
  it('returns runnable SQL after one act and does not frame or plan', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      expect(call.stopSteps).toBe(1);
      expect(call.toolChoice).toEqual({ type: 'tool', toolName: 'codemode' });
      expect(call.system).toContain('askUser');
      expect(call.system).not.toContain('Retrieved knowledge');
      return {
        text: 'here you go',
        observations: [
          {
            tool: 'codemode',
            ok: true,
            output: JSON.stringify({ ok: true, result: { ok: true, sql: 'SELECT id FROM orders' } }),
          },
        ],
      };
    };
    const out = await executeReasoningAgent(codeModeCtx({ maxReflectRetries: 2, traceCodeMode: false }), { llm });
    expect(purposes).toEqual(['act']);
    expect(out.status).toBe('ok');
    expect(out.text).toBe('SELECT id FROM orders;');
    expect(out.sql).toBe('SELECT id FROM orders;');
  });

  it('feeds askUser into a second get_rag act, then asks once in the user language', async () => {
    const users: string[] = [];
    let acts = 0;
    const llm: ReasoningLlmCall = async (call) => {
      if (call.purpose === 'ask') {
        return { text: '{"question":"Bạn muốn doanh thu của tháng nào?"}', observations: [] };
      }
      acts += 1;
      users.push(call.user);
      return {
        text: '',
        observations: [
          {
            tool: 'codemode',
            ok: false,
            output: JSON.stringify({
              ok: false,
              result: { ok: false, error: 'missing month', askUser: ['tháng nào'] },
            }),
          },
        ],
      };
    };
    const out = await executeReasoningAgent(
      codeModeCtx({ maxReflectRetries: 1, traceCodeMode: false }),
      { llm },
    );
    expect(acts).toBe(2);
    expect(users[1]).toContain('tháng nào');
    expect(users[1]).toContain('get_rag');
    expect(out.status).toBe('needs_clarification');
    expect(out.questions).toEqual(['Bạn muốn doanh thu của tháng nào?']);
    expect(out.text).toBe('Bạn muốn doanh thu của tháng nào?');
    expect(String(out.text)).not.toContain('{');
  });

  it('synthesizes immediately when retries are disabled and askUser is present', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      if (call.purpose === 'ask') {
        expect(call.user).toContain('doanh thu theo tháng');
        return { text: '{"question":"Bạn muốn tháng nào?"}', observations: [] };
      }
      return {
        text: '',
        observations: [
          {
            tool: 'codemode',
            ok: false,
            output: JSON.stringify({ result: { ok: false, askUser: ['tháng nào'] } }),
          },
        ],
      };
    };
    const out = await executeReasoningAgent(codeModeCtx({ maxReflectRetries: 0 }), { llm });
    expect(purposes).toEqual(['act', 'ask']);
    expect(out.text).toBe('Bạn muốn tháng nào?');
  });

  it('logs code mode steps only when traceCodeMode is on', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logs.push(String(line ?? ''));
    });
    const llm: ReasoningLlmCall = async () => ({
      text: 'SELECT 1 FROM dual',
      observations: [{ tool: 'codemode', ok: true, output: JSON.stringify({ ok: true, result: { ok: true, sql: 'SELECT 1 FROM dual' } }) }],
    });
    await executeReasoningAgent(codeModeCtx({ traceCodeMode: false }), { llm });
    expect(logs.some((line) => line.includes('code_mode'))).toBe(false);
    logs.length = 0;
    const traced = await executeReasoningAgent(codeModeCtx({ traceCodeMode: true, maxReflectRetries: 0 }), { llm });
    expect(logs.some((line) => line.includes('[Code Mode] start'))).toBe(true);
    expect(logs.some((line) => line.includes('[Code Mode] step'))).toBe(true);
    expect(logs.some((line) => line.includes('sql: SELECT 1 FROM dual'))).toBe(true);
    const rows = traced.codeModeTrace as Array<{ event?: string }>;
    expect(rows.map((row) => row.event)).toEqual(['code_mode.start', 'code_mode.step', 'code_mode.end']);
    spy.mockRestore();
  });
});

describe('kind routing', () => {
  it('only treats reasoning_agent as the governed kind', () => {
    expect(isReasoningAgentKind({ agentKind: 'tools_agent' })).toBe(false);
    expect(isReasoningAgentKind({ agentKind: 'reasoning_agent' })).toBe(true);
    expect(isReasoningAgentKind({})).toBe(false);
  });
});
