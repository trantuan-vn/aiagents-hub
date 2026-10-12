import { describe, expect, it } from 'vitest';

import type { NodeContext } from '../types.js';
import { executeTrigger } from './execute.js';

describe('form trigger output', () => {
  it('passes the same answer object Execute step replays from the pin', async () => {
    const fields = { c: 'mo ta', s: 'SELECT a.CODE FROM GGUSDR_APP.A_SUB_ACCOUNTS a' };
    const pinned = {
      triggerKind: 'form',
      submittedAt: 1,
      formUrl: '/f',
      executionMode: 'test',
      fields,
      c: fields.c,
      s: fields.s,
    };
    const out = await executeTrigger({
      node: {
        id: 'form',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { triggerKind: 'form', formTitle: 'SQL' },
      },
      nodeInput: { ...fields },
      runContext: {
        input: JSON.stringify(fields),
        variables: { keep: true },
        workflowName: 'wf',
        ...pinned,
      },
      input: JSON.stringify(fields),
    } as NodeContext);

    expect(out.s).toBe(fields.s);
    expect(out.c).toBe(fields.c);
    expect(out.fields).toEqual(fields);
    expect(out.formTitle).toBe('SQL');
    expect(out.triggerKind).toBe('form');
    expect(out.text).toBeUndefined();
    expect(out.input).toBeUndefined();
    expect(out.data).toBeUndefined();
    expect(out.variables).toBeUndefined();
    expect(out.workflowName).toBeUndefined();
  });
});
