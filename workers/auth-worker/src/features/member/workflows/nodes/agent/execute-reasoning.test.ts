import { describe, expect, it, vi } from 'vitest';
import { REASONING_AGENT_SYSTEM_PROMPT } from '@aiagents-hub/workflow-nodes';

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

const executeGetRagMock = vi.hoisted(() => vi.fn());
vi.mock('../tool/get-rag/execute.js', async () => {
  const actual = await vi.importActual<typeof import('../tool/get-rag/execute.js')>('../tool/get-rag/execute.js');
  return { ...actual, executeGetRag: executeGetRagMock };
});

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
    const purposes: string[] = [];
    const llm = vi.fn(async ({ purpose, system }) => {
      purposes.push(purpose);
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
    expect(purposes).toEqual(['act']);
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
      expect(call.user).toContain('doanh thu theo tháng');
      expect(call.user).toContain('schema');
      expect(call.user).toContain('Do not call get_rag');
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
    expect(users[1]).toContain('Call get_rag with only this query:\nmissing month');
    expect(users[1]).toContain('fix the previous SQL');
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

function checkSqlCtx(data: Record<string, unknown>, input: Record<string, unknown> = {}) {
  const base = ctx(
    {
      agentKind: 'reasoning_agent',
      enablePlanner: 'off',
      clarificationMode: 'best_effort',
      maxReflectRetries: 0,
      ...data,
    },
    input,
  );
  base.definition = {
    nodes: [
      base.node,
      { id: 'rag', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-rag', toolName: 'get_rag' } },
      { id: 'sql', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'check-sql', toolName: 'check_sql' } },
    ],
    edges: [
      { id: 'e1', source: 'rag', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
      { id: 'e2', source: 'sql', target: 'agent_1', sourceHandle: 'tools', targetHandle: 'tools' },
    ],
  };
  return base;
}

describe('sql generation phase 4', () => {
  it('rewrites the question from a domain system prompt and keeps the original in the act', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      if (call.purpose === 'rewrite') {
        expect(call.user).toContain('tiền bán theo tháng');
        expect(call.user).toContain('doanh thu thuần');
        expect(call.system).not.toContain('SELECT');
        return { text: 'doanh thu thuần theo tháng', observations: [] };
      }
      if (call.purpose === 'act') {
        expect(call.user).toContain('tiền bán theo tháng');
        return { text: '```sql\nSELECT 1 FROM dual\n```', observations: [] };
      }
      return { text: '{"pass":true,"issues":[]}', observations: [] };
    };
    const out = await executeReasoningAgent(
      checkSqlCtx(
        { systemPrompt: 'Bạn là chuyên gia kế toán. Dùng doanh thu thuần.', prompt: 'tiền bán theo tháng' },
        { query: 'tiền bán theo tháng', ragText: 'schema block' },
      ),
      { llm },
    );
    expect(purposes[0]).toBe('rewrite');
    expect(purposes).toContain('act');
    expect(out.status).toBe('ok');
  });

  it('skips the rewrite when the system prompt is the Reasoning Agent default', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      return { text: '```sql\nSELECT 1 FROM dual\n```', observations: [] };
    };
    await executeReasoningAgent(
      checkSqlCtx(
        { systemPrompt: REASONING_AGENT_SYSTEM_PROMPT, prompt: 'doanh thu' },
        { query: 'doanh thu', ragText: 'schema block' },
      ),
      { llm },
    );
    expect(purposes).not.toContain('rewrite');
  });

  it('keeps the original question when the rewrite call fails', async () => {
    const users: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      if (call.purpose === 'rewrite') throw new Error('llm down');
      if (call.purpose === 'act') {
        users.push(call.user);
        return { text: '```sql\nSELECT 1 FROM dual\n```', observations: [] };
      }
      return { text: '{"pass":true,"issues":[]}', observations: [] };
    };
    const out = await executeReasoningAgent(
      checkSqlCtx(
        { systemPrompt: 'Chuyên gia kế toán. Doanh thu thuần.', prompt: 'tiền bán theo tháng' },
        { query: 'tiền bán theo tháng', ragText: 'schema block' },
      ),
      { llm },
    );
    expect(out.status).toBe('ok');
    expect(users[0]).toContain('tiền bán theo tháng');
  });

  it('does not call get_rag on the first act and stops when check_sql succeeds', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      expect(Object.keys(call.tools ?? {})).not.toContain('get_rag');
      expect(Object.keys(call.tools ?? {})).toContain('check_sql');
      expect(call.system).toContain('OLD_SCHEMA_BLOCK');
      expect(call.system).not.toContain('cite as [n]');
      return {
        text: '```sql\nSELECT 1 FROM dual\n```',
        observations: [
          { tool: 'check_sql', ok: true, output: JSON.stringify({ ok: true, sql: 'SELECT 1 FROM dual' }) },
        ],
      };
    };
    const out = await executeReasoningAgent(
      checkSqlCtx(
        { maxReflectRetries: 4, prompt: 'doanh thu' },
        { query: 'doanh thu', ragText: 'OLD_SCHEMA_BLOCK', snippets: ['OLD_SCHEMA_BLOCK'] },
      ),
      { llm },
    );
    expect(purposes).toEqual(['act']);
    expect(out.sql).toBe('SELECT 1 FROM dual;');
    expect(executeGetRagMock).not.toHaveBeenCalled();
  });

  it('replaces rag from the Oracle identifier and reflects only the SQL plus the error', async () => {
    executeGetRagMock.mockResolvedValue({
      ragText: 'NEW_SCHEMA_BLOCK',
      snippets: [{ text: 'NEW_SCHEMA_BLOCK', docType: 'schema' }],
      sqlPairs: [],
      schemas: [],
      count: 1,
    });
    const systems: string[] = [];
    let acts = 0;
    const llm: ReasoningLlmCall = async (call) => {
      if (call.purpose === 'reflect') {
        expect(call.user).toContain('SELECT id FROM orders');
        expect(call.user).toContain('ORA-00904');
        expect(call.user).not.toContain('SECRET_OBSERVATION_FIELD');
        expect(call.user).not.toContain('OLD_SCHEMA_BLOCK');
        return { text: '{"pass":false,"issues":["bad column"],"rewritten":""}', observations: [] };
      }
      acts += 1;
      systems.push(call.system);
      if (acts === 1) {
        expect(Object.keys(call.tools ?? {})).not.toContain('get_rag');
        return {
          text: '```sql\nSELECT id FROM orders\n```',
          observations: [
            {
              tool: 'check_sql',
              ok: false,
              output: JSON.stringify({
                ok: false,
                error: 'ORA-00904: "NET_REVENUE": invalid identifier',
                sampleRows: ['SECRET_OBSERVATION_FIELD'],
              }),
            },
          ],
        };
      }
      return {
        text: '```sql\nSELECT net_revenue FROM orders\n```',
        observations: [
          { tool: 'check_sql', ok: true, output: JSON.stringify({ ok: true, sql: 'SELECT net_revenue FROM orders' }) },
        ],
      };
    };
    const out = await executeReasoningAgent(
      checkSqlCtx(
        { maxReflectRetries: 1, prompt: 'doanh thu thuần' },
        { query: 'doanh thu thuần', ragText: 'OLD_SCHEMA_BLOCK', snippets: ['OLD_SCHEMA_BLOCK'] },
      ),
      { llm },
    );
    expect(systems[0]).toContain('OLD_SCHEMA_BLOCK');
    expect(systems[1]).toContain('NEW_SCHEMA_BLOCK');
    expect(systems[1]).not.toContain('OLD_SCHEMA_BLOCK');
    expect(executeGetRagMock).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ query: 'NET_REVENUE' }) }),
    );
    expect(out.sql).toBe('SELECT net_revenue FROM orders;');
    executeGetRagMock.mockReset();
  });
});

describe('kind routing', () => {
  it('only treats reasoning_agent as the governed kind', () => {
    expect(isReasoningAgentKind({ agentKind: 'tools_agent' })).toBe(false);
    expect(isReasoningAgentKind({ agentKind: 'reasoning_agent' })).toBe(true);
    expect(isReasoningAgentKind({})).toBe(false);
  });
});
