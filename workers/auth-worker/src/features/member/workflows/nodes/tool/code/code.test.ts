import { describe, expect, it, vi } from 'vitest';

import {
  classifyToolName,
  codeModeSucceeded,
  validatedSqlFromObservations,
} from '../../agent/reasoning/tools.js';

vi.mock('@cloudflare/codemode', () => ({
  DynamicWorkerExecutor: class {
    constructor(_opts: unknown) {}
    execute = vi.fn();
  },
}));

vi.mock('@cloudflare/codemode/ai', () => ({
  createCodeTool: ({ tools }: { tools: Record<string, unknown> }) => ({
    description: `mock types for ${Object.keys(tools).join(',')}`,
    inputSchema: undefined,
    execute: async ({ code }: { code: string }) => ({
      result: { ok: true, sql: 'SELECT 1 FROM dual', codeLen: code.length },
      logs: [],
    }),
  }),
}));

import { collapseToCodeModeTool, codeModeToolName } from '../../../execution/agent-runtime.js';
import { createCodeModeOuterTool } from './create.js';

describe('Code Mode helpers', () => {
  it('classifies codemode as delegate', () => {
    expect(classifyToolName('codemode')).toBe('delegate');
  });

  it('extracts sql from codemode observation payload', () => {
    const sql = validatedSqlFromObservations([
      {
        tool: 'codemode',
        ok: true,
        output: JSON.stringify({
          ok: true,
          result: { ok: true, sql: 'SELECT id FROM orders' },
        }),
      },
    ]);
    expect(sql).toBe('SELECT id FROM orders');
    expect(
      codeModeSucceeded([
        {
          tool: 'codemode',
          ok: true,
          output: { ok: true, result: { ok: true, sql: 'SELECT 1 FROM dual' } },
        },
      ]),
    ).toBe(true);
  });

  it('collapse keeps tools when LOADER is missing', () => {
    const tools = {
      get_rag: { description: 'rag' } as never,
      check_sql: { description: 'check' } as never,
    };
    const out = collapseToCodeModeTool(
      tools,
      [
        { kind: 'code', config: { toolName: 'codemode' } },
        { kind: 'get-rag', config: { toolName: 'get_rag' } },
        { kind: 'check-sql', config: { toolName: 'check_sql' } },
      ],
      { env: {} as Env, userDO: {} as never },
    );
    expect(out.get_rag).toBeDefined();
    expect(out.check_sql).toBeDefined();
    expect(codeModeToolName(out)).toBeUndefined();
  });

  it('collapse replaces get_rag/check_sql with codemode when LOADER exists', () => {
    const tools = {
      get_rag: { description: 'rag' } as never,
      check_sql: { description: 'check' } as never,
    };
    const out = collapseToCodeModeTool(
      tools,
      [
        { kind: 'code', config: { toolName: 'codemode' } },
        { kind: 'get-rag', config: { toolName: 'get_rag' } },
        { kind: 'check-sql', config: { toolName: 'check_sql' } },
      ],
      { env: { LOADER: {} } as Env, userDO: {} as never },
    );
    expect(out.get_rag).toBeUndefined();
    expect(out.check_sql).toBeUndefined();
    expect(out.codemode).toBeDefined();
    expect(codeModeToolName(out)).toBe('codemode');
  });

  it('createCodeModeOuterTool rejects empty code and truncates success', async () => {
    const { tool } = createCodeModeOuterTool({
      env: { LOADER: {} } as Env,
      innerTools: {
        get_rag: { description: 'x', execute: async () => ({}) } as never,
        check_sql: { description: 'y', execute: async () => ({}) } as never,
      },
    });
    const execute = tool.execute as (input: { code: string }) => Promise<unknown>;
    const empty = await execute({ code: '   ' });
    expect(empty).toMatchObject({ result: { ok: false } });

    const ok = (await execute({
      code: 'async () => ({ ok: true, sql: "SELECT 1 FROM dual" })',
    })) as { ok?: boolean; result?: { sql?: string } };
    expect(ok.ok).toBe(true);
    expect(ok.result?.sql).toContain('SELECT');
  });
});
