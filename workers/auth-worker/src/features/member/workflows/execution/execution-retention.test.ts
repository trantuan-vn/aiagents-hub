import { describe, expect, it } from 'vitest';

import {
  selectExecutionIdsToPrune,
  type ExecutionHistoryLimits,
} from './execution-retention.js';
import type { ExecutionRow } from './execution-store.js';
import { buildExecutionExportPack, buildStoredZip } from './execution-export.js';

function row(
  partial: Partial<ExecutionRow> & Pick<ExecutionRow, 'id' | 'status' | 'startedAt'>,
): ExecutionRow {
  return {
    executionKey: `k-${partial.id}`,
    workflowId: 1,
    workflowOwnerId: 'owner',
    totalCostVnd: 0,
    totalCreditsCharged: 0,
    totalCreditsRoyalty: 0,
    stepCount: 0,
    state: '{}',
    ...partial,
  } as ExecutionRow;
}

describe('selectExecutionIdsToPrune', () => {
  const limits: ExecutionHistoryLimits = { max: 2, days: 7 };
  const now = Date.parse('2026-09-22T00:00:00.000Z');
  const day = 86_400_000;

  it('never selects running or pending_human', () => {
    const ids = selectExecutionIdsToPrune(
      [
        row({ id: 1, status: 'running', startedAt: now - day * 30 }),
        row({ id: 2, status: 'pending_human', startedAt: now - day * 30 }),
        row({ id: 3, status: 'completed', startedAt: now - day, finishedAt: now - day }),
      ],
      limits,
      now,
    );
    expect(ids).toEqual([]);
  });

  it('drops terminal rows older than days', () => {
    const ids = selectExecutionIdsToPrune(
      [
        row({ id: 10, status: 'completed', startedAt: now - day * 10, finishedAt: now - day * 10 }),
        row({ id: 11, status: 'failed', startedAt: now - day, finishedAt: now - day }),
      ],
      limits,
      now,
    );
    expect(ids).toEqual([10]);
  });

  it('keeps newest max terminal rows within the window', () => {
    const ids = selectExecutionIdsToPrune(
      [
        row({ id: 1, status: 'completed', startedAt: now - day * 3, finishedAt: now - day * 3 }),
        row({ id: 2, status: 'completed', startedAt: now - day * 2, finishedAt: now - day * 2 }),
        row({ id: 3, status: 'completed', startedAt: now - day, finishedAt: now - day }),
        row({ id: 4, status: 'running', startedAt: now }),
      ],
      { max: 2, days: 7 },
      now,
    );
    expect(ids.sort()).toEqual([1]);
  });
});

describe('buildStoredZip / export pack', () => {
  it('builds a zip that starts with local file signature', () => {
    const zip = buildStoredZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  });

  it('redacts password and strips raw from state', () => {
    const pack = buildExecutionExportPack(
      row({
        id: 9,
        status: 'completed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        state: JSON.stringify({
          engine: {
            steps: [{ nodeId: 'n1', status: 'success' }],
            outputs: { n1: { password: 'secret', raw: { huge: true }, text: 'ok' } },
          },
          persistMeta: { schemaVersion: 1, ioClipped: false },
        }),
      }),
    );
    expect(pack.filename).toContain('support.zip');
    expect(pack.contentType).toBe('application/zip');
    const asText = new TextDecoder().decode(pack.bytes);
    expect(asText).toContain('manifest.json');
    expect(asText).toContain('***');
    expect(asText).not.toContain('"secret"');
    expect(asText).not.toContain('"huge"');
  });
});
