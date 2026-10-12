import { describe, expect, it, vi } from 'vitest';

import { CODE_JS_ALL_ITEMS_SOURCE, CODE_JS_EACH_ITEM_SOURCE } from '@aiagents-hub/workflow-nodes';

vi.mock('@cloudflare/codemode', () => ({
  DynamicWorkerExecutor: class {
    async execute(code: string) {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
        body: string,
      ) => () => Promise<unknown>;
      try {
        const result = await new AsyncFunction(`return await (${code})()`)();
        return { result, logs: [] };
      } catch (err) {
        return {
          result: undefined,
          error: err instanceof Error ? err.message : String(err),
          logs: [],
        };
      }
    }
  },
}));

import { executeDataTransformation } from './execute.js';
import type { NodeContext } from '../types.js';

function ctx(data: Record<string, unknown>, nodeInput: Record<string, unknown>): NodeContext {
  return {
    node: {
      id: 'code-1',
      type: 'data_transformation',
      position: { x: 0, y: 0 },
      data,
    },
    nodeInput,
    c: { env: { LOADER: {} } },
  } as NodeContext;
}

describe('Code in JavaScript node', () => {
  it('adds a field to every item when run once for all items', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForAllItems',
          language: 'javascript',
          jsCode: CODE_JS_ALL_ITEMS_SOURCE,
        },
        { name: 'Ada', items: [{ json: { name: 'Ada' } }, { json: { name: 'Bea' } }] },
      ),
    );
    expect(out.itemCount).toBe(2);
    expect(out.data).toEqual([
      { name: 'Ada', myNewField: 1 },
      { name: 'Bea', myNewField: 1 },
    ]);
  });

  it('runs once per item and exposes the new field on a single result', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForEachItem',
          language: 'javascript',
          jsCode: CODE_JS_EACH_ITEM_SOURCE,
        },
        { title: 'Hello' },
      ),
    );
    expect(out.itemCount).toBe(1);
    expect(out.myNewField).toBe(1);
    expect(out.title).toBe('Hello');
    expect((out.json as { title?: string }).title).toBe('Hello');
  });

  it('reads a dragged field from the upstream object when items do not contain it', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForAllItems',
          language: 'javascript',
          jsCode: 'return { user: $input.item.json.user, schemaName: $input.item.json.schemaName };',
        },
        {
          user: 'ADA',
          schemaName: 'HR',
          items: [{ tableName: 'ORDERS', schemaName: 'HR' }],
        },
      ),
    );
    expect(out.user).toBe('ADA');
    expect(out.schemaName).toBe('HR');
  });

  it('reads a form answer from fields when the root key is null', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForEachItem',
          language: 'javascript',
          jsCode: `
            const sql = $input.item.json.s || '';
            $input.item.json.tables = sql.includes('A_SUB_ACCOUNTS') ? ['GGUSDR_APP.A_SUB_ACCOUNTS'] : [];
            return $input.item;
          `,
        },
        {
          c: 'mo ta',
          s: null,
          fields: { c: 'mo ta', s: 'SELECT a.CODE FROM GGUSDR_APP.A_SUB_ACCOUNTS a' },
          executionMode: 'test',
        },
      ),
    );
    expect(out.s).toContain('A_SUB_ACCOUNTS');
    expect(out.tables).toEqual(['GGUSDR_APP.A_SUB_ACCOUNTS']);
  });

  it('keeps fields assigned on $input.item when returning the item', async () => {
    const nodeInput = {
      c: 'mo ta',
      executionMode: 'test',
      fields: { c: 'mo ta', s: 'SELECT a.CODE FROM GGUSDR_APP.A_SUB_ACCOUNTS a' },
      formTitle: '',
      formUrl: '',
      input: '{}',
    };
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForEachItem',
          language: 'javascript',
          jsCode: `
            const sql = $input.item.json.s || $input.item.json.fields?.s || '';
            $input.item.json.tables = sql.includes('A_SUB_ACCOUNTS') ? ['GGUSDR_APP.A_SUB_ACCOUNTS'] : [];
            return $input.item;
          `,
        },
        nodeInput,
      ),
    );
    expect(out.tables).toEqual(['GGUSDR_APP.A_SUB_ACCOUNTS']);
    expect((out.data as { fields?: { s?: string } }).fields?.s).toContain('A_SUB_ACCOUNTS');
    expect(structuredClone(out.tables)).toEqual(['GGUSDR_APP.A_SUB_ACCOUNTS']);
  });

  it('splits tables the same way from a form pin and from a live trigger payload', async () => {
    const sql = 'SELECT a.CODE FROM GGUSDR_APP.A_SUB_ACCOUNTS a';
    const fields = { c: 'mo ta', s: sql };
    const pin = {
      triggerKind: 'form',
      submittedAt: 1,
      formUrl: '',
      executionMode: 'test',
      fields,
      c: fields.c,
      s: fields.s,
    };
    const live = {
      input: JSON.stringify(fields),
      variables: {},
      workflowName: 'wf',
      ...pin,
      triggeredAt: 2,
      text: JSON.stringify(fields),
      data: undefined,
      formTitle: '',
    };
    const jsCode = `
      const sql = $input.item.json.s || '';
      const names = sql.includes('A_SUB_ACCOUNTS') ? ['GGUSDR_APP.A_SUB_ACCOUNTS', 'GGUSDR_APP.A_SUB_ACC_SSA'] : [];
      return names.map((table) => ({
        json: {
          table,
          s: $input.item.json.s ?? null,
          text: $input.item.json.text ?? null,
          input: $input.item.json.input ?? null,
        },
      }));
    `;
    const run = (nodeInput: Record<string, unknown>) =>
      executeDataTransformation(
        ctx(
          { transformKind: 'code', mode: 'runOnceForEachItem', language: 'javascript', jsCode },
          nodeInput,
        ),
      );
    const fromPin = await run(pin);
    const fromLive = await run(live);
    expect(fromPin.itemCount).toBe(2);
    expect(fromPin.data).toEqual([
      { table: 'GGUSDR_APP.A_SUB_ACCOUNTS', s: sql, text: null, input: null },
      { table: 'GGUSDR_APP.A_SUB_ACC_SSA', s: sql, text: null, input: null },
    ]);
    expect(fromLive.data).toEqual(fromPin.data);
    expect(fromLive.items).toEqual(fromPin.items);
  });

  it('reads parent fields in each-item mode without replacing the row', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          mode: 'runOnceForEachItem',
          language: 'javascript',
          jsCode: 'return { user: $input.item.json.user, tableName: $input.item.json.tableName };',
        },
        {
          user: 'ADA',
          items: [{ tableName: 'ORDERS', schemaName: 'HR' }],
        },
      ),
    );
    expect(out.itemCount).toBe(1);
    expect(out.user).toBe('ADA');
    expect(out.tableName).toBe('ORDERS');
  });

  it('rejects Python', async () => {
    await expect(
      executeDataTransformation(
        ctx(
          { transformKind: 'code', language: 'python', jsCode: 'return 1' },
          { ok: true },
        ),
      ),
    ).rejects.toThrow(/JavaScript/);
  });

  it('returns the error payload when continue on fail is set', async () => {
    const out = await executeDataTransformation(
      ctx(
        {
          transformKind: 'code',
          language: 'javascript',
          continueOnFail: true,
          jsCode: 'throw new Error("boom")',
        },
        { ok: true },
      ),
    );
    expect(String(out.error)).toMatch(/boom/);
    expect(out.itemCount).toBe(0);
  });
});
