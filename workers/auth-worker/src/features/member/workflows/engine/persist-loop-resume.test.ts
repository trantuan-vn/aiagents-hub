import { describe, expect, it } from 'vitest';

import { MAX_PERSIST_BYTES, serializePersistedState } from './persist-state.js';
import { pipelineItems } from '../nodes/tool/shared/pipeline.js';
import { executeLoopOverItems } from './loop-helpers.js';

function bulkyLoopCheckpoint(opts: {
  tableCount: number;
  batchIndex: number;
  successSteps?: number;
  dumpSize?: number;
  iterationDumpSize?: number;
  extraOutputBytes?: number;
}) {
  const {
    tableCount,
    batchIndex,
    successSteps = Math.max(batchIndex, 12),
    dumpSize = 200_000,
    iterationDumpSize = 0,
    extraOutputBytes = 0,
  } = opts;
  const tables = Array.from(
    { length: tableCount },
    (_, i) => `TBL_${String(i).padStart(4, '0')}_SOMEWHAT_LONG_NAME`,
  );
  const items = tables.map((tableName) => ({ tableName, schemaName: 'ADMIN' }));
  const connection = {
    type: 'oracle',
    user: 'u',
    password: 'p'.repeat(40),
    connectString: 'host:1521/ORCL',
  };
  const connectionCtx = {
    dbId: '1',
    schemaName: 'ADMIN',
    tables,
    count: tableCount,
    tableCount,
    connection,
    user: 'u',
    password: 'p'.repeat(40),
    connectString: 'host:1521/ORCL',
    connectionType: 'oracle',
  };
  const current = items[batchIndex]!;
  const loopOut = {
    ...connectionCtx,
    ...current,
    items: [current],
    batchIndex,
    batchSize: 1,
    totalBatches: tableCount,
    loopCompleted: false,
    flowKind: 'loop_over_items',
  };
  const loopState = {
    items,
    batchSize: 1,
    currentBatchIndex: batchIndex,
    totalBatches: tableCount,
    iterationOutputs: Array.from({ length: Math.min(batchIndex, 20) }, (_, i) => ({
      ok: true,
      dump: 'z'.repeat(iterationDumpSize),
      table: items[i]!.tableName,
    })),
    connectionCtx,
  };
  const stepRows = Array.from({ length: successSteps }, (_, i) => ({
    nodeId: 'saverag',
    nodeType: 'tool',
    status: 'success' as const,
    input: { ...connectionCtx, ...items[i % items.length], items: [items[i % items.length]] },
    output: { ok: true, saved: 12, dump: 'x'.repeat(dumpSize) },
  }));

  const outputs: Record<string, unknown> = {
    dbinfo: { ...connectionCtx, items },
    loop: loopOut,
    saverag: { error: 'timeout' },
  };
  if (extraOutputBytes > 0) {
    outputs.extra = { payload: 'y'.repeat(extraOutputBytes) };
  }

  return {
    definition: {
      nodes: [
        { id: 'loop', type: 'flow', data: { flowKind: 'loop_over_items' } },
        { id: 'saverag', type: 'tool' },
      ],
      edges: [{ source: 'loop', target: 'saverag', sourceHandle: 'loop' }],
    },
    meta: { workflowId: 30 },
    engine: {
      queue: [],
      visited: ['form', 'dbinfo', 'loop'],
      skipped: [],
      outputs,
      steps: [
        {
          nodeId: 'dbinfo',
          nodeType: 'tool',
          status: 'success',
          input: {},
          output: { ...connectionCtx, items },
        },
        {
          nodeId: 'loop',
          nodeType: 'flow',
          status: 'success',
          input: { ...connectionCtx, items },
          output: loopOut,
        },
        ...stepRows,
        {
          nodeId: 'saverag',
          nodeType: 'tool',
          status: 'error',
          error: 'timeout',
          input: { ...connectionCtx, ...current, items: [current] },
          output: { error: 'timeout' },
        },
      ],
      runContext: {
        input: '',
        variables: {},
        __saveRagIndexedTables: items.slice(0, batchIndex).map((i) => i.tableName),
      },
      totalCostVnd: 0,
      loopStates: { loop: loopState },
    },
  };
}

describe('persist large loop for resume', () => {
  it('keeps current loop batch items and indexed-table resume markers', () => {
    const persisted = bulkyLoopCheckpoint({
      tableCount: 940,
      batchIndex: 5,
      extraOutputBytes: 1_500_000,
    });
    expect(JSON.stringify(persisted).length).toBeGreaterThan(MAX_PERSIST_BYTES);

    const parsed = JSON.parse(serializePersistedState(persisted));
    const loopItems = pipelineItems(parsed.engine.outputs.loop ?? {});
    expect(loopItems.length).toBeGreaterThan(0);
    expect(String(loopItems[0]?.tableName ?? '')).toMatch(/^TBL_/);

    const loopState = parsed.engine.loopStates?.loop;
    expect(loopState?.currentBatchIndex).toBe(5);
    expect(loopState?.totalBatches).toBe(940);
    expect(Array.isArray(loopState?.items) ? loopState.items.length : 0).toBe(940);
    expect(
      Array.isArray(parsed.engine.runContext?.__saveRagIndexedTables)
        ? parsed.engine.runContext.__saveRagIndexedTables.length
        : 0,
    ).toBe(5);
  });

  it('survives deep compaction without empty Save RAG upstream items', () => {
    const persisted = bulkyLoopCheckpoint({
      tableCount: 940,
      batchIndex: 12,
      successSteps: 40,
      dumpSize: 80_000,
      iterationDumpSize: 80_000,
      extraOutputBytes: 800_000,
    });
    const parsed = JSON.parse(serializePersistedState(persisted));
    const loopItems = pipelineItems(parsed.engine.outputs.loop ?? {});
    if (loopItems.length) {
      expect(String(loopItems[0]?.tableName ?? '')).toBeTruthy();
      return;
    }
    // If loop output was clipped away, loopState must still rehydrate the batch.
    const state = parsed.engine.loopStates?.loop;
    expect(state).toBeTruthy();
    const result = executeLoopOverItems(
      { batchSize: 1, flowKind: 'loop_over_items' },
      {},
      state,
      false,
    );
    expect(pipelineItems(result.output).length).toBeGreaterThan(0);
  });
});
