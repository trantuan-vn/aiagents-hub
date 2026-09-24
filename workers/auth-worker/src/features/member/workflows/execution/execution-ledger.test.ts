import { describe, expect, it } from 'vitest';

import {
  executionPatchShouldSyncLedger,
  slimWorkflowExecutionForQueue,
} from './execution-ledger.js';

describe('execution-ledger (Phase B.1)', () => {
  it('strips control-plane fields from queue payload', () => {
    const slim = slimWorkflowExecutionForQueue({
      executionKey: 'abc',
      workflowId: 1,
      status: 'completed',
      state: '{"huge":true}',
      input: 'in',
      output: 'out',
      pendingNodeId: 'n1',
      error: 'x'.repeat(600),
      totalCreditsCharged: 3,
    });
    expect(slim.state).toBeUndefined();
    expect(slim.input).toBeUndefined();
    expect(slim.output).toBeUndefined();
    expect(slim.pendingNodeId).toBeUndefined();
    expect(String(slim.error).length).toBe(500);
    expect(slim.executionKey).toBe('abc');
    expect(slim.totalCreditsCharged).toBe(3);
  });

  it('only syncs ledger when business fields change', () => {
    expect(executionPatchShouldSyncLedger({ state: '{}' })).toBe(false);
    expect(executionPatchShouldSyncLedger({ output: '{}' })).toBe(false);
    expect(executionPatchShouldSyncLedger({ status: 'completed' })).toBe(true);
    expect(executionPatchShouldSyncLedger({ totalCreditsCharged: 1 })).toBe(true);
    expect(executionPatchShouldSyncLedger({ finishedAt: Date.now() })).toBe(true);
  });
});
