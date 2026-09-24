import { describe, expect, it } from 'vitest';

import {
  BACKPRESSURE_REASON,
  PENDING_HARD_PER_TABLE,
  PENDING_HARD_PER_USER,
  PENDING_SOFT_PER_TABLE,
  PENDING_SOFT_PER_USER,
  PROCESSED_CLEANUP_THRESHOLD,
  SLOW_FLUSH_INTERVAL_MULTIPLIER,
  SLOW_FLUSH_TTL_MS,
  WORKFLOW_SOFT_THROTTLE_MS,
  backpressureErrorMessage,
  effectiveFlushInterval,
  evaluatePendingCaps,
  evaluateWorkflowRunFairness,
  isBackpressureError,
  isSlowFlushActive,
  isT1PendingGateTable,
  nextSlowFlushUntil,
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

describe('scale-safety Phase B slow-flush + fairness', () => {
  it('multiplies flush interval when slow-flush active', () => {
    expect(effectiveFlushInterval(5_000, false)).toBe(5_000);
    expect(effectiveFlushInterval(5_000, true)).toBe(5_000 * SLOW_FLUSH_INTERVAL_MULTIPLIER);
    expect(effectiveFlushInterval(5_000, true, 3)).toBe(15_000);
  });

  it('arms slow-flush TTL and detects expiry', () => {
    const now = 1_000_000;
    const until = nextSlowFlushUntil(now, SLOW_FLUSH_TTL_MS);
    expect(until).toBe(now + SLOW_FLUSH_TTL_MS);
    expect(isSlowFlushActive(until, now + 1_000)).toBe(true);
    expect(isSlowFlushActive(until, until + 1)).toBe(false);
    expect(isSlowFlushActive(null)).toBe(false);
  });

  it('rejects workflow runs over hard pending', () => {
    const d = evaluateWorkflowRunFairness({
      pendingTotal: PENDING_HARD_PER_USER + 1,
    });
    expect(d.action).toBe('reject');
    if (d.action === 'reject') expect(d.code).toBe('BACKPRESSURE');
  });

  it('throttles soft-exceeded runs within min gap', () => {
    const now = 10_000_000;
    const d = evaluateWorkflowRunFairness({
      pendingTotal: PENDING_SOFT_PER_USER,
      lastRunAt: now - 1_000,
      now,
    });
    expect(d.action).toBe('throttle');
    if (d.action === 'throttle') {
      expect(d.code).toBe('BACKPRESSURE_SOFT');
      expect(d.waitMs).toBe(WORKFLOW_SOFT_THROTTLE_MS - 1_000);
    }
  });

  it('allows soft-exceeded run after throttle window', () => {
    const now = 10_000_000;
    const d = evaluateWorkflowRunFairness({
      pendingTotal: PENDING_SOFT_PER_USER,
      lastRunAt: now - WORKFLOW_SOFT_THROTTLE_MS - 1,
      now,
    });
    expect(d.action).toBe('allow');
  });

  it('allows when under soft', () => {
    expect(
      evaluateWorkflowRunFairness({ pendingTotal: 100, lastRunAt: Date.now() }).action,
    ).toBe('allow');
  });
});
