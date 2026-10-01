import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { vectorChunkId } from '../../../rag/index.js';
import { getToolModule } from '../shared/registry.js';
import { executeSaveSqlPairPipeline, sqlPairChunkText, sqlPairDocumentId } from './execute.js';
import { saveSqlPairToolModule } from './module.js';
import { cleanRewrittenQuestion } from './rewrite-question.js';

const billingMock = vi.hoisted(() => ({
  resolveServiceByEndpoint: vi.fn(),
  findApprovedServiceByEndpoint: vi.fn().mockResolvedValue(null),
  findApprovedServiceByModel: vi.fn().mockResolvedValue(null),
  listApprovedServices: vi.fn().mockResolvedValue([]),
  billEmbeddingUsage: vi.fn().mockResolvedValue(0),
  billAgentUsage: vi.fn().mockResolvedValue(0),
  ensureWalletBalance: vi.fn().mockResolvedValue(undefined),
  runTextModel: vi.fn(),
  extractTextFromAiResponse: vi.fn(),
  getModelForService: vi.fn((service: Record<string, unknown>) => String(service.model ?? '')),
}));

vi.mock('../../../billing/billing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../billing/billing.js')>();
  return { ...actual, ...billingMock };
});

function embedService(endpoint: string) {
  return {
    id: 1,
    endpoint,
    catalogId: 'bge-m3',
    embedModel: '@cf/baai/bge-m3',
    model: '@cf/baai/bge-m3',
    approvalStatus: 'approved',
    isActive: 1,
  };
}

function mockAi(dimensions = 4) {
  return {
    run: vi.fn().mockImplementation(async (_model: string, input: { text: string | string[] }) => {
      const texts = Array.isArray(input.text) ? input.text : [input.text];
      return {
        data: texts.map(() => Array.from({ length: dimensions }, () => 0.1)),
        usage: { prompt_tokens: texts.length * 4, completion_tokens: 0, total_tokens: texts.length * 4 },
      };
    }),
  };
}

function pairGraph(extra: Record<string, unknown> = {}, dimensions?: number): WorkflowDefinition {
  return {
    nodes: [
      {
        id: 'pair',
        type: 'tool_node',
        position: { x: 0, y: 0 },
        data: {
          toolKind: 'save-sql-pair',
          questionField: '{{ $json.question }}',
          sqlField: '{{ $json.sql }}',
          embedModel: '/api/ai/baai/bge-m3',
          ...extra,
        },
      },
      {
        id: 'mem',
        type: 'memory_node',
        position: { x: 0, y: 0 },
        data: {
          memoryKind: 'vectorize',
          collection: 'VECTORIZE',
          namespace: 'kb-ns',
          ...(dimensions ? { dimensions } : {}),
        },
      },
    ],
    edges: [{ id: 'e-mem', source: 'mem', target: 'pair', sourceHandle: 'memory', targetHandle: 'memory' }],
  };
}

function withLlm(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    nodes: [
      ...definition.nodes,
      {
        id: 'svc_llm',
        type: 'service_node',
        position: { x: 0, y: 0 },
        data: { endpoint: '/api/ai/meta/llama-3.1-8b-instruct', model: '@cf/meta/llama-3.1-8b-instruct' },
      },
    ],
    edges: [
      ...definition.edges,
      { id: 'e-llm', source: 'svc_llm', target: 'pair', sourceHandle: 'service', targetHandle: 'llm' },
    ],
  };
}

function ctxFor(
  definition: WorkflowDefinition,
  env: Env,
  nodeInput: Record<string, unknown>,
): NodeContext {
  return {
    node: definition.nodes[0]!,
    nodeInput,
    definition,
    outputs: {},
    runContext: {},
    c: { env },
    meta: { ownerId: 'user-1', workflowId: 42 },
    user: { identifier: 'user@example.com' },
    bindingName: 'USER_DO',
    userDO: {},
  } as unknown as NodeContext;
}

describe('save sql pair', () => {
  beforeEach(() => {
    billingMock.resolveServiceByEndpoint.mockImplementation(async (_user: unknown, endpoint: string) => {
      if (String(endpoint).includes('bge') || String(endpoint).includes('embed')) return embedService(String(endpoint));
      return {
        id: 2,
        endpoint,
        catalogId: 'llama',
        model: '@cf/meta/llama-3.1-8b-instruct',
        approvalStatus: 'approved',
      };
    });
    billingMock.listApprovedServices.mockResolvedValue([embedService('/api/ai/baai/bge-m3')]);
    billingMock.billEmbeddingUsage.mockResolvedValue(0);
    billingMock.billAgentUsage.mockResolvedValue(0);
    billingMock.runTextModel.mockReset();
    billingMock.extractTextFromAiResponse.mockReset();
  });

  it('is pipeline-only and registered', () => {
    expect(saveSqlPairToolModule.toolClass).toBe('persist');
    expect(saveSqlPairToolModule.createAgentTool).toBeUndefined();
    expect(getToolModule('save-sql-pair')?.executePipeline).toBeTypeOf('function');
  });

  it('embeds the question only and stores the SQL in the chunk text', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const ai = mockAi();
    const env = { AI: ai, VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph();
    const question = 'doanh thu theo tháng';
    const sql = 'SELECT month, SUM(amount) FROM sales';

    const out = await executeSaveSqlPairPipeline(
      ctxFor(definition, env, { question, sql }),
    );

    expect(out.ok).toBe(true);
    expect(out.saved).toBe(1);
    expect(out.documentId).toBe(await sqlPairDocumentId(question));
    expect(out.collection).toBeTruthy();
    expect(ai.run).toHaveBeenCalled();
    const embedded = ai.run.mock.calls.map((call) => {
      const input = call[1] as { text: string | string[] };
      return input.text;
    });
    expect(embedded.flat().join('\n')).toContain(question);
    expect(embedded.flat().join('\n')).not.toContain(sql);

    const vectors = upsert.mock.calls[0]?.[0] as Array<{
      id: string;
      values: number[];
      metadata?: Record<string, string>;
    }>;
    expect(vectors).toHaveLength(1);
    const vector = vectors[0]!;
    expect(vector.id).toBe(await vectorChunkId(String(out.documentId), 0));
    expect(vector.metadata?.docType).toBe('sqlpair');
    expect(vector.metadata?.formatVersion).toBe('2');
    expect(vector.metadata?.embedModel).toBe('bge-m3');
    expect(vector.metadata?.text).toBe(sqlPairChunkText(question, sql));
    expect(vector.metadata?.text).toContain(sql);
    expect(vector.metadata).not.toHaveProperty('sql');
    expect(vector.values).toHaveLength(4);
  });

  it('overwrites the same question with a stable document id', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph();
    const first = await executeSaveSqlPairPipeline(
      ctxFor(definition, env, { question: '  doanh thu  ', sql: 'SELECT 1' }),
    );
    const second = await executeSaveSqlPairPipeline(
      ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 2' }),
    );
    expect(second.documentId).toBe(first.documentId);
    const ids = upsert.mock.calls.map((call) => (call[0] as Array<{ id: string }>)[0]?.id);
    expect(ids[0]).toBe(ids[1]);
  });

  it('does not upsert when question or SQL is empty', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph();
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: 'doanh thu', sql: '   ' })),
    ).rejects.toThrow(/question and SQL are required/);
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: '', sql: 'SELECT 1' })),
    ).rejects.toThrow(/question and SQL are required/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not upsert when embedding dimensions disagree with the index', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(4), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph({}, 1024);
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 1' })),
    ).rejects.toThrow(/dimensions \(4\) do not match Vectorize index \(1024\)/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('uses the first catalog embed service when the combo is empty', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph({ embedModel: '' });
    const out = await executeSaveSqlPairPipeline(
      ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 1' }),
    );
    expect(out.ok).toBe(true);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.embedModel).toBe('bge-m3');
    expect(billingMock.listApprovedServices).toHaveBeenCalled();
  });

  it('rejects a chat model and does not upsert', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph({ embedModel: '/api/ai/meta/llama' });
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 1' })),
    ).rejects.toThrow(/not an embedding model/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('embeds the rewritten question when a system prompt and LLM are set', async () => {
    const rewritten = 'Doanh thu thuần theo tháng';
    billingMock.runTextModel.mockResolvedValue({ response: rewritten });
    billingMock.extractTextFromAiResponse.mockReturnValue(rewritten);
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const ai = mockAi();
    const env = { AI: ai, VECTORIZE: { upsert } } as unknown as Env;
    const question = 'doanh thu theo tháng';
    const sql = 'SELECT month, SUM(net_amount) FROM sales';
    const definition = withLlm(
      pairGraph({ describeSystemPrompt: 'Bạn là chuyên gia kế toán. Dùng doanh thu thuần.' }),
    );

    const out = await executeSaveSqlPairPipeline(ctxFor(definition, env, { question, sql }));

    expect(out.ok).toBe(true);
    expect(out.llmCalls).toBe(1);
    expect(out.documentId).toBe(await sqlPairDocumentId(question));
    const messages = billingMock.runTextModel.mock.calls[0]?.[2] as Array<{ role: string; content: string }>;
    expect(messages[0]?.content.startsWith('Bạn là chuyên gia kế toán')).toBe(true);
    expect(messages[1]?.content).toContain(question);
    expect(messages[1]?.content).toContain(sql);
    const embedded = ai.run.mock.calls.map((call) => {
      const input = call[1] as { text: string | string[] };
      return Array.isArray(input.text) ? input.text.join('\n') : input.text;
    });
    expect(embedded.join('\n')).toContain(rewritten);
    expect(embedded.join('\n')).not.toContain(sql);
    const vectors = upsert.mock.calls[0]?.[0] as Array<{ metadata?: Record<string, string> }>;
    expect(vectors[0]?.metadata?.text).toBe(sqlPairChunkText(rewritten, sql));
    expect(vectors[0]?.metadata).not.toHaveProperty('sql');
  });

  it('does not upsert when the system prompt is set and the LLM handle is missing', async () => {
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = pairGraph({ describeSystemPrompt: 'Bạn là chuyên gia kế toán.' });
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 1' })),
    ).rejects.toThrow(/LLM handle/);
    expect(upsert).not.toHaveBeenCalled();
    expect(billingMock.runTextModel).not.toHaveBeenCalled();
  });

  it('does not upsert when the model returns SQL instead of a question', async () => {
    billingMock.runTextModel.mockResolvedValue({ response: 'SELECT 1' });
    billingMock.extractTextFromAiResponse.mockReturnValue('SELECT 1');
    const upsert = vi.fn().mockResolvedValue({ count: 1 });
    const env = { AI: mockAi(), VECTORIZE: { upsert } } as unknown as Env;
    const definition = withLlm(pairGraph({ describeSystemPrompt: 'Bạn là chuyên gia kế toán.' }));
    await expect(
      executeSaveSqlPairPipeline(ctxFor(definition, env, { question: 'doanh thu', sql: 'SELECT 1' })),
    ).rejects.toThrow(/rewritten question is empty/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('cleanRewrittenQuestion', () => {
  it('keeps the question and drops a fence or a leading label', () => {
    expect(cleanRewrittenQuestion('```\nDoanh thu thuần theo tháng\n```')).toBe('Doanh thu thuần theo tháng');
    expect(cleanRewrittenQuestion('Question: Doanh thu thuần theo tháng')).toBe('Doanh thu thuần theo tháng');
    expect(cleanRewrittenQuestion('"Doanh thu thuần"')).toBe('Doanh thu thuần');
    expect(cleanRewrittenQuestion('SELECT month FROM sales')).toBe('');
  });
});
