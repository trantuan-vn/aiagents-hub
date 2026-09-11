import { describe, expect, it } from 'vitest';

import { defaultScheduleRule, scheduleRuleToCron } from '@aiagents-hub/workflow-nodes';

import {
  cronJitterMs,
  cronMatches,
  cronQueueDelaySeconds,
  minuteKey,
  nextCronOccurrence,
  resolveAlarmTime,
  summarizeEnabledCrons,
} from './triggers.js';

describe('nextCronOccurrence', () => {
  it('returns the next minute for * * * * *', () => {
    const from = new Date('2026-09-11T12:30:45.123Z');
    const next = nextCronOccurrence('* * * * *', from);
    expect(next?.toISOString()).toBe('2026-09-11T12:31:00.000Z');
  });

  it('aligns to the next matching minute for */5', () => {
    const from = new Date('2026-09-11T12:31:00.000Z');
    const next = nextCronOccurrence('*/5 * * * *', from);
    expect(next?.toISOString()).toBe('2026-09-11T12:35:00.000Z');
  });

  it('advances to tomorrow for a daily midnight cron', () => {
    const from = new Date('2026-09-11T10:30:00.000Z');
    const next = nextCronOccurrence('0 0 * * *', from);
    expect(next?.toISOString()).toBe('2026-09-12T00:00:00.000Z');
  });

  it('returns null for an invalid expression without scanning', () => {
    expect(nextCronOccurrence('0 0 * *', new Date('2026-09-11T00:00:00.000Z'))).toBeNull();
  });

  it('matches cronMatches at the returned instant', () => {
    const expr = '15 8 * * 1';
    const from = new Date('2026-09-11T00:00:00.000Z');
    const next = nextCronOccurrence(expr, from);
    expect(next).not.toBeNull();
    expect(cronMatches(expr, next!)).toBe(true);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe('minuteKey', () => {
  it('truncates to YYYY-MM-DDTHH:MM', () => {
    expect(minuteKey(new Date('2026-09-11T12:30:45.123Z'))).toBe('2026-09-11T12:30');
  });
});

describe('resolveAlarmTime', () => {
  it('returns null when nothing is scheduled', () => {
    expect(resolveAlarmTime(null)).toBeNull();
  });

  it('clamps overdue nextRunAt to now', () => {
    expect(resolveAlarmTime(1000, undefined, 5000)).toBe(5000);
  });

  it('pulls the alarm in when the hint is sooner', () => {
    expect(resolveAlarmTime(10_000, 6_000, 1_000)).toBe(6_000);
  });

  it('keeps the earlier D1 nextRunAt over a later hint', () => {
    expect(resolveAlarmTime(4_000, 9_000, 1_000)).toBe(4_000);
  });
});

describe('cron jitter', () => {
  it('is stable for the same owner and trigger', () => {
    expect(cronJitterMs('0 0 * * *', 'owner-a', 'trig-1')).toBe(
      cronJitterMs('0 0 * * *', 'owner-a', 'trig-1'),
    );
  });

  it('keeps high-frequency crons within 15s', () => {
    expect(cronJitterMs('* * * * *', 'owner-a', 'trig-1')).toBeLessThan(15_000);
    expect(cronJitterMs('*/5 * * * *', 'owner-a', 'trig-1')).toBeLessThan(15_000);
  });

  it('spreads daily crons across 2 minutes', () => {
    expect(cronJitterMs('0 0 * * *', 'owner-a', 'trig-1')).toBeLessThan(120_000);
    expect(cronJitterMs('0 0 * * *', 'owner-b', 'trig-1')).not.toBe(
      cronJitterMs('0 0 * * *', 'owner-a', 'trig-1'),
    );
  });

  it('caps queue delay at 30s', () => {
    expect(cronQueueDelaySeconds('owner-a', 'trig-1')).toBeLessThanOrEqual(30);
  });
});

describe('default schedule', () => {
  it('defaults to hourly instead of midnight UTC', () => {
    const rule = defaultScheduleRule();
    expect(rule.field).toBe('hours');
    expect(scheduleRuleToCron(rule)).toBe('0 */1 * * *');
  });
});

describe('summarizeEnabledCrons', () => {
  const row = (
    partial: Partial<{
      workflowId: number;
      type: 'cron' | 'webhook';
      enabled: number;
      cronExpr: string | null;
      nextRunAt: number | null;
    }>,
  ) => ({
    workflowId: 1,
    type: 'cron' as const,
    enabled: 1,
    cronExpr: '0 * * * *',
    nextRunAt: 1000,
    ...partial,
  });

  it('ignores disabled, non-cron, and empty expressions', () => {
    const map = summarizeEnabledCrons([
      row({ enabled: 0 }),
      row({ type: 'webhook', cronExpr: null }),
      row({ cronExpr: '  ' }),
    ]);
    expect(map.size).toBe(0);
  });

  it('picks the soonest nextRunAt when a workflow has several crons', () => {
    const map = summarizeEnabledCrons([
      row({ cronExpr: '0 0 * * *', nextRunAt: 5000 }),
      row({ cronExpr: '*/15 * * * *', nextRunAt: 2000 }),
      row({ workflowId: 2, cronExpr: '0 8 * * 1', nextRunAt: null }),
    ]);
    expect(map.get(1)).toEqual({
      cronCount: 2,
      cronExpr: '*/15 * * * *',
      nextRunAt: 2000,
    });
    expect(map.get(2)).toEqual({
      cronCount: 1,
      cronExpr: '0 8 * * 1',
      nextRunAt: null,
    });
  });
});
