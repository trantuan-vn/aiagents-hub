import { describe, expect, it } from 'vitest';

import { isStoppableExecutionStatus, persistStatusHonoringCancel } from './cancel-helpers.js';

describe('stop execution', () => {
  it('allows stopping live or paused runs', () => {
    expect(isStoppableExecutionStatus('running')).toBe(true);
    expect(isStoppableExecutionStatus('pending_human')).toBe(true);
  });

  it('rejects already-finished runs', () => {
    expect(isStoppableExecutionStatus('completed')).toBe(false);
    expect(isStoppableExecutionStatus('failed')).toBe(false);
    expect(isStoppableExecutionStatus('cancelled')).toBe(false);
  });

  it('keeps cancelled when the in-flight engine later finishes', () => {
    expect(persistStatusHonoringCancel('cancelled', 'completed')).toBe('cancelled');
    expect(persistStatusHonoringCancel('cancelled', 'failed')).toBe('cancelled');
    expect(persistStatusHonoringCancel('running', 'completed')).toBe('completed');
    expect(persistStatusHonoringCancel('running', 'pending_human')).toBe('pending_human');
  });
});
