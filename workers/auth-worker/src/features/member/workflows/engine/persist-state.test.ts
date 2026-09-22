import { describe, expect, it } from 'vitest';

import {
  clipValue,
  executionPersistFlags,
  isTruncatedStub,
  MAX_PERSIST_BYTES,
  OUTPUT_SUMMARY_MAX_BYTES,
  PersistStateTooLargeError,
  serializeOutputSummary,
  serializePersistedState,
  utf8ByteLength,
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
    expect(utf8ByteLength(json)).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
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
    expect(utf8ByteLength(json)).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
    const parsed = JSON.parse(json);
    expect(isTruncatedStub(parsed)).toBe(false);
    expect(parsed.engine.visited).toEqual(['form', 'dbinfo']);
    expect(parsed.ioTruncated).toBe(true);
    expect(parsed.ioClipped).toBe(true);
    expect(parsed.clipPolicy).toBeTruthy();
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

  it('produces identical JSON for the same oversized input (deterministic)', () => {
    const bulky = {
      zebra: 'z'.repeat(400_000),
      alpha: 'a'.repeat(400_000),
      mid: { nested: 'n'.repeat(200_000) },
    };
    const persisted = {
      definition: { nodes: [], edges: [] },
      meta: { workflowId: 1 },
      engine: {
        queue: ['n1'],
        visited: [],
        skipped: [],
        outputs: { n1: bulky },
        steps: [{ nodeId: 'n1', nodeType: 'tool', status: 'success', input: bulky, output: bulky }],
        runContext: { input: '' },
        totalCostVnd: 0,
      },
    };
    const a = serializePersistedState(persisted);
    const b = serializePersistedState(persisted);
    expect(a).toBe(b);
    expect(utf8ByteLength(a)).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
  });

  it('strips agent raw / RAG docs before budget clipping', () => {
    const json = serializePersistedState({
      definition: { nodes: [], edges: [] },
      meta: { workflowId: 1 },
      engine: {
        queue: [],
        visited: ['agent'],
        outputs: {
          agent: {
            text: 'hello',
            raw: { choices: [{ content: 'r'.repeat(1_500_000) }] },
            documents: Array.from({ length: 50 }, () => ({ body: 'd'.repeat(50_000) })),
          },
        },
        steps: [
          {
            nodeId: 'agent',
            nodeType: 'agent',
            status: 'success',
            output: { text: 'hello', raw: { huge: 'r'.repeat(1_500_000) } },
          },
        ],
        runContext: { input: '' },
        totalCostVnd: 0,
      },
    });
    const parsed = JSON.parse(json);
    expect(utf8ByteLength(json)).toBeLessThanOrEqual(MAX_PERSIST_BYTES);
    expect(parsed.engine.outputs.agent?.raw).toBeUndefined();
    expect(parsed.engine.outputs.agent?.documents).toBeUndefined();
    expect(parsed.engine.outputs.agent?.text).toBe('hello');
  });
});

describe('serializeOutputSummary', () => {
  it('returns full JSON when under budget', () => {
    expect(serializeOutputSummary({ ok: true })).toBe(JSON.stringify({ ok: true }));
  });

  it('never emits a destructive {_truncated} stub', () => {
    const huge = { blob: 'x'.repeat(OUTPUT_SUMMARY_MAX_BYTES * 2) };
    const json = serializeOutputSummary(huge)!;
    expect(utf8ByteLength(json)).toBeLessThanOrEqual(OUTPUT_SUMMARY_MAX_BYTES + 256);
    const parsed = JSON.parse(json);
    expect(parsed._truncated).toBeUndefined();
    expect(parsed.clipped).toBe(true);
    expect(parsed.summary).toBeDefined();
    expect(parsed.byteLength).toBeGreaterThan(OUTPUT_SUMMARY_MAX_BYTES);
  });
});

describe('clipValue', () => {
  it('keeps objects under the budget unchanged', () => {
    const value = { items: [{ id: 1 }, { id: 2 }] };
    expect(clipValue(value, 10_000)).toEqual(value);
  });

  it('clips object keys in sorted order (deterministic)', () => {
    const value = {
      zed: 'z'.repeat(500),
      alpha: 'a'.repeat(500),
      mid: 'm'.repeat(500),
    };
    const a = clipValue(value, 200);
    const b = clipValue(value, 200);
    expect(a).toEqual(b);
    expect(Object.keys(a as object)).toEqual(Object.keys(a as object).slice().sort());
  });
});

describe('isTruncatedStub', () => {
  it('detects the legacy persist stub that blocked Approve', () => {
    expect(isTruncatedStub({ _truncated: true, byteLength: 768537 })).toBe(true);
    expect(isTruncatedStub({ ioTruncated: true, engine: { queue: [] } })).toBe(false);
  });
});

describe('executionPersistFlags', () => {
  it('distinguishes legacy stub from ioClipped', () => {
    expect(executionPersistFlags({ _truncated: true, byteLength: 1 })).toEqual({
      legacyStub: true,
      ioClipped: false,
      persistDegraded: false,
      truncated: true,
    });
    expect(executionPersistFlags({ ioTruncated: true, engine: { queue: [] } })).toEqual({
      legacyStub: false,
      ioClipped: true,
      persistDegraded: false,
      truncated: true,
    });
    expect(
      executionPersistFlags({ persistDegraded: true, ioClipped: true, engine: { queue: [] } }),
    ).toEqual({
      legacyStub: false,
      ioClipped: true,
      persistDegraded: true,
      truncated: true,
    });
  });
});

describe('PersistStateTooLargeError', () => {
  it('is an Error subclass with byteLength', () => {
    const err = new PersistStateTooLargeError(3_000_000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PersistStateTooLargeError');
    expect(err.byteLength).toBe(3_000_000);
  });
});
