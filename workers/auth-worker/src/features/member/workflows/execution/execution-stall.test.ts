import { describe, expect, it } from 'vitest';

import {
  EXECUTION_STALL_MS,
  executionProgressAt,
  isExecutionStalled,
} from './execution-stall.js';

describe('execution stall detection', () => {
  const base = {
    id: 1,
    status: 'running' as const,
    startedAt: 1_000,
    workflowId: 30,
  };

  it('uses updated_at when present', () => {
    expect(executionProgressAt({ ...base, updated_at: 5_000 })).toBe(5_000);
  });

  it('falls back to startedAt', () => {
    expect(executionProgressAt(base)).toBe(1_000);
  });

  it('flags long-silent running executions', () => {
    const now = base.startedAt + EXECUTION_STALL_MS + 1;
    expect(isExecutionStalled({ ...base, updated_at: base.startedAt }, now)).toBe(true);
  });

  it('ignores fresh progress and terminal rows', () => {
    const now = base.startedAt + EXECUTION_STALL_MS + 1;
    expect(
      isExecutionStalled({ ...base, updated_at: now - 60_000 }, now),
    ).toBe(false);
    expect(
      isExecutionStalled({ ...base, status: 'failed', updated_at: base.startedAt }, now),
    ).toBe(false);
    expect(
      isExecutionStalled(
        { ...base, finishedAt: base.startedAt + 10, updated_at: base.startedAt },
        now,
      ),
    ).toBe(false);
  });
});
