import { describe, expect, it } from 'vitest';

import {
  BACKPRESSURE_REASON,
  PENDING_HARD_PER_TABLE,
  PENDING_HARD_PER_USER,
  PENDING_SOFT_PER_TABLE,
  PENDING_SOFT_PER_USER,
  PROCESSED_CLEANUP_THRESHOLD,
  backpressureErrorMessage,
  evaluatePendingCaps,
  isBackpressureError,
  isT1PendingGateTable,
  shouldCleanupProcessed,
} from './scale-safety.js';

describe('scale-safety pending caps', () => {
  it('documents soft/hard constants from spec §4.1', () => {
    expect(PENDING_SOFT_PER_TABLE).toBe(2_000);
    expect(PENDING_HARD_PER_TABLE).toBe(10_000);
    expect(PENDING_SOFT_PER_USER).toBe(10_000);
    expect(PENDING_HARD_PER_USER).toBe(50_000);
    expect(PROCESSED_CLEANUP_THRESHOLD).toBe(5_000);
  });

  it('gates T1 billing tables only', () => {
    expect(isT1PendingGateTable('service_usages')).toBe(true);
    expect(isT1PendingGateTable('orders')).toBe(true);
    expect(isT1PendingGateTable('users')).toBe(false);
  });

  it('allows soft exceed and marks softExceeded', () => {
    const d = evaluatePendingCaps({
      table: 'service_usages',
      tablePendingAfter: PENDING_SOFT_PER_TABLE,
      userPendingAfter: 100,
    });
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.softExceeded).toBe(true);
  });

  it('rejects hard per-table with backpressure', () => {
    const d = evaluatePendingCaps({
      table: 'service_usages',
      tablePendingAfter: PENDING_HARD_PER_TABLE + 1,
      userPendingAfter: 100,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.reason).toBe(BACKPRESSURE_REASON);
      expect(d.scope).toBe('table');
      expect(isBackpressureError(backpressureErrorMessage(d))).toBe(true);
    }
  });

  it('rejects hard per-user with backpressure', () => {
    const d = evaluatePendingCaps({
      table: 'service_usages',
      tablePendingAfter: 10,
      userPendingAfter: PENDING_HARD_PER_USER + 1,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.scope).toBe('user');
  });

  it('does not hard-reject non-T1 even above table hard', () => {
    const d = evaluatePendingCaps({
      table: 'workflow_comments',
      tablePendingAfter: PENDING_HARD_PER_TABLE + 50,
      userPendingAfter: 10,
    });
    expect(d.ok).toBe(true);
  });

  it('shouldCleanupProcessed when count > threshold even without pending', () => {
    expect(shouldCleanupProcessed(PROCESSED_CLEANUP_THRESHOLD)).toBe(false);
    expect(shouldCleanupProcessed(PROCESSED_CLEANUP_THRESHOLD + 1)).toBe(true);
  });
});
