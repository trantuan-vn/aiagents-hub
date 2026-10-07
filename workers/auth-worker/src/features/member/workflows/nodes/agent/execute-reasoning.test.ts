import { describe, expect, it, vi } from 'vitest';
import { REASONING_AGENT_SYSTEM_PROMPT } from '@aiagents-hub/workflow-nodes';

/** `@cloudflare/codemode` (used by tools_agent Code Mode) imports `cloudflare:workers`. */
vi.mock('@cloudflare/codemode', () => ({
  DynamicWorkerExecutor: class {
    constructor(_opts: unknown) {}
  },
}));
vi.mock('@cloudflare/codemode/ai', () => ({
  createCodeTool: () => ({ description: 'mock codemode', execute: async () => ({ result: null, logs: [] }) }),
}));

/** Real prefetch unless a test queues a result; `vi.mock` keeps the rest of the module. */
const prefetchMock = vi.hoisted(() => vi.fn());
vi.mock('../tool/get-rag/execute.js', async () => {
  const actual = await vi.importActual<typeof import('../tool/get-rag/execute.js')>('../tool/get-rag/execute.js');
  prefetchMock.mockImplementation(actual.prefetchLinkedGetRag);
  return { ...actual, prefetchLinkedGetRag: prefetchMock };
});

/** Oracle client imports `cloudflare:sockets`; tests inject `deps.checkSql` instead. */
const executeCheckSqlMock = vi.hoisted(() => vi.fn());
vi.mock('../tool/check-sql/execute.js', () => ({ executeCheckSql: executeCheckSqlMock }));

vi.mock('../../billing/billing.js', () => ({
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  resolveServiceByEndpoint: vi.fn().mockResolvedValue({ model: '@cf/meta/llama-3.1-8b-instruct' }),
  getModelForService: vi.fn().mockReturnValue('@cf/meta/llama-3.1-8b-instruct'),
  runTextModel: vi.fn(),
  extractTextFromAiResponse: vi.fn(),
  finishReasonFromAiResponse: (response: unknown) => {
    if (!response || typeof response !== 'object') return '';
    const choices = (response as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
    return String((choices[0] as { finish_reason?: unknown }).finish_reason ?? '');
  },
  billAgentUsage: vi.fn().mockResolvedValue(0),
  asBillingAiResponse: (usage: unknown, fallbackText = '') =>
    usage != null && typeof usage === 'object' ? usage : { response: fallbackText },
  billGenerateTextCalls: vi.fn().mockResolvedValue(undefined),
}));

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { extractTextFromAiResponse, runTextModel } from '../../billing/billing.js';
import type { CheckSqlResult } from '../tool/check-sql/execute.js';
import {
  executeReasoningAgent,
  raisedOutputTokenLimit,
  readReasoningOptions,
  type ReasoningLlmCall,
} from './execute-reasoning.js';
import { isReasoningAgentKind } from './shared.js';

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
    meta: { ownerId: 'owner', workflowId: 1, isOwnedByUser: true, workflowName: 'wf' },
    executionKey: '11111111-1111-4111-8111-111111111111',
  } as NodeContext;
}

/** Agent with Get RAG + Check SQL linked: the Text-to-SQL pipeline. */
function sqlCtx(data: Record<string, unknown>, input: Record<string, unknown> = {}) {
  const base = ctx({ agentKind: 'reasoning_agent', ...data }, input);
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

const ok = (sql: string): CheckSqlResult => ({ ok: true, sql, columns: ['N'], rowCount: 1, sampleRows: [], elapsedMs: 1 });
const bad = (error: string): CheckSqlResult => ({ ok: false, error });

describe('executeReasoningAgent — shared gates', () => {
  it('refuses dangerous requests without calling the LLM', async () => {
    const llm = vi.fn() as unknown as ReasoningLlmCall;
    const out = await executeReasoningAgent(
      ctx({ agentKind: 'reasoning_agent', prompt: 'how to make a bomb' }, { query: 'how to make a bomb' }),
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
    expect(out.questions).toHaveLength(1);
    expect(llm).not.toHaveBeenCalled();
  });

  it('reads options, including a mapped INPUT expression, and drops removed knobs', () => {
    expect(
      readReasoningOptions(
        { maxReflectRetries: 3, clarificationMode: 'best_effort', requireCitations: false, safetyLevel: 'strict' },
        {},
      ),
    ).toMatchObject({ maxRepairs: 3, clarificationMode: 'best_effort', requireCitations: false, safetyLevel: 'strict' });
    expect(readReasoningOptions({ maxReflectRetries: '{{ $json.retries }}' }, { retries: 0 }).maxRepairs).toBe(0);
    expect(readReasoningOptions({ maxReflectRetries: 99 }, {}).maxRepairs).toBe(5);
    expect(readReasoningOptions({}, {}).maxRepairs).toBe(2);
    expect(readReasoningOptions({}, {})).not.toHaveProperty('enablePlanner');
  });
});

describe('Text-to-SQL pipeline', () => {
  it('retrieves, generates once, validates, and returns the runnable statement', async () => {
    prefetchMock.mockResolvedValueOnce({
      ragText: '# ORDERS\n\n## schema\nCREATE TABLE ORDERS (ID NUMBER)',
      snippets: ['CREATE TABLE ORDERS (ID NUMBER)'],
      query: 'liệt kê đơn hàng',
    });
    const calls: Array<{ purpose: string; system: string; user: string; tools?: unknown }> = [];
    const llm: ReasoningLlmCall = async (call) => {
      calls.push(call);
      return { text: 'Here you go:\n```sql\nSELECT id FROM orders\n```', observations: [] };
    };
    const checkSql = vi.fn(async (sql: string) => ok(sql));
    const out = await executeReasoningAgent(
      sqlCtx({ prompt: 'liệt kê đơn hàng', systemPrompt: REASONING_AGENT_SYSTEM_PROMPT }, { query: 'liệt kê đơn hàng' }),
      { llm, checkSql },
    );
    expect(calls.map((c) => c.purpose)).toEqual(['sql']);
    expect(calls[0]!.tools).toBeUndefined();
    expect(calls[0]!.user).toContain('liệt kê đơn hàng');
    expect(calls[0]!.user).toContain('CREATE TABLE ORDERS');
    expect(calls[0]!.system).not.toContain('CREATE TABLE ORDERS');
    expect(calls[0]!.system).toContain('ASK:');
    expect(checkSql).toHaveBeenCalledWith('SELECT id FROM orders');
    expect(out.status).toBe('ok');
    expect(out.text).toBe('SELECT id FROM orders;');
    expect(out.sql).toBe('SELECT id FROM orders;');
    expect(out.validated).toBe(true);
    expect(out.attempts).toBe(1);
    expect(out.snippets).toEqual(['CREATE TABLE ORDERS (ID NUMBER)']);
    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock.mock.calls[0]?.[2]).toBe('liệt kê đơn hàng');
    expect(prefetchMock.mock.calls[0]?.[3]).toBe('');
    prefetchMock.mockClear();
  });

  it('rewrites the retrieval query only when the system prompt adds domain vocabulary', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      if (call.purpose === 'rewrite') {
        expect(call.user).toContain('tiền bán theo tháng');
        return { text: 'doanh thu thuần theo tháng', observations: [] };
      }
      expect(call.user).toContain('tiền bán theo tháng');
      return { text: '```sql\nSELECT 1 FROM dual\n```', observations: [] };
    };
    await executeReasoningAgent(
      sqlCtx(
        { systemPrompt: 'Bạn là chuyên gia kế toán. Dùng doanh thu thuần.', prompt: 'tiền bán theo tháng' },
        { query: 'tiền bán theo tháng', ragText: '# T\n\n## schema\nCREATE TABLE T (A NUMBER)' },
      ),
      { llm, checkSql: async (sql) => ok(sql) },
    );
    expect(purposes).toEqual(['rewrite', 'sql']);
    // Upstream ragText is reused; the rewritten sentence is still handed to prefetch as the forced query.
    expect(prefetchMock.mock.calls[0]?.[3]).toBe('doanh thu thuần theo tháng');
    prefetchMock.mockClear();

    const defaults: string[] = [];
    await executeReasoningAgent(
      sqlCtx(
        { systemPrompt: REASONING_AGENT_SYSTEM_PROMPT, prompt: 'doanh thu' },
        { query: 'doanh thu', ragText: '# T\n\n## schema\nCREATE TABLE T (A NUMBER)' },
      ),
      {
        llm: async (call) => {
          defaults.push(call.purpose);
          return { text: '```sql\nSELECT 1 FROM dual\n```', observations: [] };
        },
        checkSql: async (sql) => ok(sql),
      },
    );
    expect(defaults).toEqual(['sql']);
  });

  it('repairs from the Oracle error: re-retrieves the failing identifier and keeps the first schema', async () => {
    const users: string[] = [];
    let acts = 0;
    const llm: ReasoningLlmCall = async (call) => {
      acts += 1;
      users.push(call.user);
      return acts === 1
        ? { text: '```sql\nSELECT net_revenue FROM orders\n```', observations: [] }
        : { text: '```sql\nSELECT revenue FROM orders\n```', observations: [] };
    };
    const checkSql = vi
      .fn<(sql: string) => Promise<CheckSqlResult>>()
      .mockResolvedValueOnce(bad('ORA-00904: "NET_REVENUE": invalid identifier'))
      .mockResolvedValueOnce(ok('SELECT revenue FROM orders'));
    const retrieve = vi.fn(async (query: string) => ({
      ragText: `# REVENUE_HINT for ${query}\n\n## schema\nCREATE TABLE ORDERS (REVENUE NUMBER)`,
      snippets: ['CREATE TABLE ORDERS (REVENUE NUMBER)'],
      query,
    }));
    const out = await executeReasoningAgent(
      sqlCtx(
        { prompt: 'doanh thu thuần', maxReflectRetries: 2 },
        { query: 'doanh thu thuần', ragText: '# ORDERS\n\n## schema\nOLD_SCHEMA_BLOCK', snippets: ['OLD_SCHEMA_BLOCK'] },
      ),
      { llm, checkSql, retrieve },
    );
    expect(acts).toBe(2);
    expect(retrieve).toHaveBeenCalledWith('NET_REVENUE');
    expect(users[0]).toContain('OLD_SCHEMA_BLOCK');
    expect(users[0]).not.toContain('Oracle error');
    expect(users[1]).toContain('OLD_SCHEMA_BLOCK');
    expect(users[1]).toContain('REVENUE_HINT for NET_REVENUE');
    expect(users[1]).toContain('Previous SQL:\nSELECT net_revenue FROM orders');
    expect(users[1]).toContain('ORA-00904');
    expect(out.sql).toBe('SELECT revenue FROM orders;');
    expect(out.validated).toBe(true);
    expect(out.attempts).toBe(2);
  });

  it('does not re-retrieve for syntax errors', async () => {
    const retrieve = vi.fn();
    const checkSql = vi
      .fn<(sql: string) => Promise<CheckSqlResult>>()
      .mockResolvedValueOnce(bad('ORA-00933: SQL command not properly ended'))
      .mockResolvedValueOnce(ok('SELECT 1 FROM dual'));
    const out = await executeReasoningAgent(
      sqlCtx({ prompt: 'x', maxReflectRetries: 1 }, { query: 'x', ragText: '# T\n\n## schema\nT' }),
      { llm: async () => ({ text: '```sql\nSELECT 1 FROM dual\n```', observations: [] }), checkSql, retrieve },
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(out.validated).toBe(true);
  });

  it('returns the model ASK as a clarification without validating', async () => {
    const checkSql = vi.fn();
    const out = await executeReasoningAgent(
      sqlCtx({ prompt: 'doanh thu theo tháng' }, { query: 'doanh thu theo tháng', ragText: '# T\n\n## schema\nT' }),
      { llm: async () => ({ text: 'ASK: Bạn muốn doanh thu của tháng nào?', observations: [] }), checkSql },
    );
    expect(checkSql).not.toHaveBeenCalled();
    expect(out.status).toBe('needs_clarification');
    expect(out.text).toBe('Bạn muốn doanh thu của tháng nào?');
    expect(out.questions).toEqual(['Bạn muốn doanh thu của tháng nào?']);
    expect(out.sql).toBe('');
  });

  it('asks one synthesized question in the user language when repairs run out', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      if (call.purpose === 'ask') {
        expect(call.user).toContain('doanh thu theo tháng');
        expect(call.user).toContain('ORA-00904');
        return { text: '{"question":"Bạn muốn doanh thu của tháng nào?"}', observations: [] };
      }
      return { text: '```sql\nSELECT bad FROM orders\n```', observations: [] };
    };
    const out = await executeReasoningAgent(
      sqlCtx({ prompt: 'doanh thu theo tháng', maxReflectRetries: 1 }, { query: 'doanh thu theo tháng', ragText: '# T\n\n## schema\nT' }),
      { llm, checkSql: async () => bad('ORA-00904: "BAD": invalid identifier'), retrieve: async () => null },
    );
    expect(purposes).toEqual(['sql', 'sql', 'ask']);
    expect(out.status).toBe('needs_clarification');
    expect(out.text).toBe('Bạn muốn doanh thu của tháng nào?');
    expect(out.reason).toContain('ORA-00904');
    expect(out.sql).toBe('');
  });

  it('best_effort returns the last draft unvalidated instead of asking', async () => {
    const purposes: string[] = [];
    const out = await executeReasoningAgent(
      sqlCtx({ prompt: 'x', maxReflectRetries: 0, clarificationMode: 'best_effort' }, { query: 'x', ragText: '# T\n\n## schema\nT' }),
      {
        llm: async (call) => {
          purposes.push(call.purpose);
          expect(call.system).not.toContain('ASK:');
          return { text: '```sql\nSELECT bad FROM orders\n```', observations: [] };
        },
        checkSql: async () => bad('ORA-00904: "BAD": invalid identifier'),
      },
    );
    expect(purposes).toEqual(['sql']);
    expect(out.status).toBe('ok');
    expect(out.validated).toBe(false);
    expect(out.sql).toBe('SELECT bad FROM orders;');
    expect(out.reason).toContain('ORA-00904');
  });

  it('fails the run when the validator has no credentials instead of looping', async () => {
    await expect(
      executeReasoningAgent(
        sqlCtx({ prompt: 'x', maxReflectRetries: 3 }, { query: 'x', ragText: '# T\n\n## schema\nT' }),
        {
          llm: async () => ({ text: '```sql\nSELECT 1 FROM dual\n```', observations: [] }),
          checkSql: async () => bad('Missing Oracle credentials. Set userField / passwordField / connectStringField on Check SQL.'),
        },
      ),
    ).rejects.toThrow(/Missing Oracle credentials/);
  });

  it('records a trace only when traceCodeMode is on', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logs.push(String(line ?? ''));
    });
    const deps = {
      llm: (async () => ({ text: '```sql\nSELECT 1 FROM dual\n```', observations: [] })) as ReasoningLlmCall,
      checkSql: async (sql: string) => ok(sql),
    };
    const quiet = await executeReasoningAgent(sqlCtx({ prompt: 'x' }, { query: 'x', ragText: '# T\n\n## schema\nT' }), deps);
    expect(quiet.trace).toBeUndefined();
    expect(logs.some((line) => line.includes('sql.'))).toBe(false);

    const traced = await executeReasoningAgent(
      sqlCtx({ prompt: 'x', traceCodeMode: true }, { query: 'x', ragText: '# T\n\n## schema\nT' }),
      deps,
    );
    const rows = traced.trace as Array<{ event: string }>;
    expect(rows.map((r) => r.event)).toEqual(['sql.retrieve', 'sql.generate', 'sql.validate', 'sql.end']);
    expect(logs.some((line) => line.includes('"event":"sql.validate"'))).toBe(true);
    spy.mockRestore();
  });
});

describe('generic tool chat', () => {
  it('answers in one act turn with citations from snippets', async () => {
    const purposes: string[] = [];
    const llm: ReasoningLlmCall = async (call) => {
      purposes.push(call.purpose);
      expect(call.user).toContain('orders(id, total)');
      return { text: 'Orders use id and total [1].', observations: [] };
    };
    const out = await executeReasoningAgent(
      ctx(
        { agentKind: 'reasoning_agent', prompt: 'What columns does orders have?', requireCitations: true },
        { query: 'What columns does orders have?', snippets: ['orders(id, total)'] },
      ),
      { llm },
    );
    expect(purposes).toEqual(['act']);
    expect(out.status).toBe('ok');
    expect(String(out.text)).toContain('[1]');
    expect((out.citations as unknown[]).length).toBeGreaterThan(0);
  });

  it('turns ask_user into a clarification', async () => {
    const llm: ReasoningLlmCall = async (call) => {
      expect(Object.keys(call.tools ?? {})).toContain('ask_user');
      return { text: '', observations: [], askedUser: { questions: ['Which month?'], why: 'period missing' } };
    };
    const out = await executeReasoningAgent(
      ctx({ agentKind: 'reasoning_agent', prompt: 'revenue' }, { query: 'revenue' }),
      { llm },
    );
    expect(out.status).toBe('needs_clarification');
    expect(out.text).toBe('Which month?');
  });

  it('does not crash when the model returns empty text and a tool result is missing', async () => {
    const out = await executeReasoningAgent(
      ctx({ agentKind: 'reasoning_agent', prompt: 'thông tin số dư', requireCitations: true }, { query: 'thông tin số dư' }),
      {
        llm: async () => ({
          text: undefined as unknown as string,
          observations: [{ tool: 'get_rag', ok: true, output: undefined as unknown as string }],
        }),
      },
    );
    expect(out.status).toBe('ok');
    expect(typeof out.text).toBe('string');
    expect(out.sql).toBe('');
  });
});

describe('max token limit', () => {
  it('raises a cut-off budget once, up to the cap', () => {
    expect(raisedOutputTokenLimit(512)).toBe(8192);
    expect(raisedOutputTokenLimit(4096)).toBe(8192);
    expect(raisedOutputTokenLimit(8192)).toBe(16384);
    expect(raisedOutputTokenLimit(32768)).toBe(32768);
  });

  it('retries the SQL call at the higher limit when the model stops for length', async () => {
    const run = vi.mocked(runTextModel);
    const extract = vi.mocked(extractTextFromAiResponse);
    run.mockReset();
    extract.mockReset();
    run
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: 'SELECT' } }] })
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '```sql\nSELECT 1 FROM dual\n```' } }] });
    extract.mockImplementation((response: unknown) => {
      const choice = (response as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0];
      return choice?.message?.content ?? '';
    });
    try {
      const out = await executeReasoningAgent(
        sqlCtx(
          { prompt: 'doanh thu', serviceEndpoint: 'https://llm.example/v1', maxTokens: 1024 },
          { query: 'doanh thu', ragText: '# T\n\n## schema\nT' },
        ),
        { checkSql: async (sql) => ok(sql) },
      );
      expect(run).toHaveBeenCalledTimes(2);
      expect(run.mock.calls[0]?.[3]).toBe(1024);
      expect(run.mock.calls[1]?.[3]).toBe(8192);
      expect(out.sql).toBe('SELECT 1 FROM dual;');
    } finally {
      run.mockReset();
      extract.mockReset();
    }
  });
});

describe('kind routing', () => {
  it('only treats reasoning_agent as the governed kind', () => {
    expect(isReasoningAgentKind({ agentKind: 'tools_agent' })).toBe(false);
    expect(isReasoningAgentKind({ agentKind: 'reasoning_agent' })).toBe(true);
    expect(isReasoningAgentKind({})).toBe(false);
  });
});
