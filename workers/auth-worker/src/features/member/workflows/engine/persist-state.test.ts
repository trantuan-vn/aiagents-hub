import { describe, expect, it } from 'vitest';

import {
  clipValue,
  isTruncatedStub,
  MAX_PERSIST_BYTES,
  serializePersistedState,
} from './persist-state.js';

describe('serializePersistedState', () => {
  it('keeps a small snapshot intact', () => {
    const persisted = {
      definition: { nodes: [{ id: 'gmail', type: 'human_review' }], edges: [] },
      meta: { workflowId: 19 },
      engine: { queue: [], visited: ['form'], outputs: { form: { ok: true } }, steps: [] },
    };
    const json = serializePersistedState(persisted);
    expect(JSON.parse(json).engine.visited).toEqual(['form']);
    expect(JSON.parse(json)._truncated).toBeUndefined();
  });

  it('does not replace an oversized snapshot with a resume-breaking stub', () => {
    const bulky = { payload: 'x'.repeat(900_000), connection: { password: 'secret' } };
    const json = serializePersistedState({
      definition: { nodes: [{ id: 'gmail', type: 'human_review', data: {} }], edges: [] },
      meta: { workflowId: 19, ownerId: 'owner' },
      autoApproveHumanReview: false,
      engine: {
        queue: [],
        visited: ['form', 'dbinfo'],
        skipped: [],
        outputs: { dbinfo: bulky },
        steps: [
          {
            nodeId: 'gmail',
            nodeType: 'human_review',
            status: 'pending_human',
            input: bulky,
            output: { payload: bulky },
          },
        ],
        runContext: { input: bulky.payload },
        totalCostVnd: 0,
      },
    });
    expect(json.length).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
    const parsed = JSON.parse(json);
    expect(isTruncatedStub(parsed)).toBe(false);
    expect(parsed.engine.visited).toEqual(['form', 'dbinfo']);
    expect(parsed.ioTruncated).toBe(true);
    expect(parsed.engine.steps[0].input).toBeDefined();
    expect(String(parsed.engine.steps[0].input.payload).startsWith('xxx')).toBe(true);
    expect(parsed.engine.steps[0].output.payload).toBeDefined();
    expect(parsed.engine.outputs.dbinfo.payload).toBeDefined();
  });

  it('keeps a modest loop output when a sibling payload is huge', () => {
    const loopOut = {
      items: Array.from({ length: 40 }, (_, i) => ({ id: i, name: `row-${i}` })),
      flowKind: 'loop_over_items',
    };
    const json = serializePersistedState({
      definition: { nodes: [{ id: 'loop', type: 'flow' }], edges: [] },
      meta: { workflowId: 19 },
      engine: {
        queue: [],
        visited: ['db', 'loop'],
        outputs: {
          db: { dump: 'y'.repeat(2_500_000) },
          loop: loopOut,
        },
        steps: [
          { nodeId: 'db', nodeType: 'tool', status: 'success', input: { ok: true }, output: { dump: 'y'.repeat(2_500_000) } },
          { nodeId: 'loop', nodeType: 'flow', status: 'success', input: { tables: ['EMP'] }, output: loopOut },
        ],
        runContext: { input: '' },
        totalCostVnd: 0,
      },
    });
    const parsed = JSON.parse(json);
    expect(parsed.engine.steps.find((s: { nodeId: string }) => s.nodeId === 'loop').input).toEqual({
      tables: ['EMP'],
    });
    expect(parsed.engine.outputs.loop.items.length).toBeGreaterThan(1);
    expect(parsed.engine.outputs.loop.items[0]).toEqual({ id: 0, name: 'row-0' });
    expect(parsed.engine.outputs.loop._truncated).toBeUndefined();
  });
});

describe('clipValue', () => {
  it('keeps objects under the budget unchanged', () => {
    const value = { items: [{ id: 1 }, { id: 2 }] };
    expect(clipValue(value, 10_000)).toEqual(value);
  });
});

describe('isTruncatedStub', () => {
  it('detects the legacy persist stub that blocked Approve', () => {
    expect(isTruncatedStub({ _truncated: true, byteLength: 768537 })).toBe(true);
    expect(isTruncatedStub({ ioTruncated: true, engine: { queue: [] } })).toBe(false);
  });
});
