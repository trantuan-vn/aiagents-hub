import { describe, expect, it } from 'vitest';
import {
  PIPELINE_ARCHIVE_TABLES,
  SYNC_TABLE_NAMES,
  classifyPipelineEvent,
  isPipelineTelemetryEvent,
  isValidDoUserId,
  maxStageStatus,
  matchPipelineRunbook,
} from './domain.js';
import { buildPipelineRecommendations } from './recommendations.js';
import type { PipelineIncident, PipelineOverviewDto, StageHealth } from './domain.js';
import { pipelineFingerprint } from './incidents.js';

function stage(partial: Partial<StageHealth> & Pick<StageHealth, 'stage' | 'status'>): StageHealth {
  return {
    summary: '',
    metrics: {},
    ...partial,
  };
}

describe('pipeline-health domain', () => {
  it('classifies queue and cron events', () => {
    expect(classifyPipelineEvent('queue.chunk_failed')?.code).toBe('queue.chunk_failed');
    expect(classifyPipelineEvent('queue.dlq_entry')?.severity).toBe('critical');
    expect(classifyPipelineEvent('cron.pipeline_failed')?.stage).toBe('r2');
    expect(classifyPipelineEvent('do.flush_failed')?.stage).toBe('do');
    expect(isPipelineTelemetryEvent('handler.request_error')).toBe(false);
    expect(isPipelineTelemetryEvent('queue.parse_unknown_table')).toBe(true);
  });

  it('overall status is max severity', () => {
    expect(maxStageStatus(['healthy', 'watch', 'unavailable'])).toBe('unavailable');
    expect(maxStageStatus(['healthy', 'incident', 'unavailable'])).toBe('incident');
  });

  it('validates DO user ids', () => {
    expect(isValidDoUserId('a'.repeat(64))).toBe(true);
    expect(isValidDoUserId('not-an-id')).toBe(false);
  });

  it('fingerprint stable when uuid differs', async () => {
    const a = await pipelineFingerprint({
      stage: 'queue',
      code: 'queue.chunk_failed',
      table: 'orders',
      message: 'fail user 11111111-1111-1111-1111-111111111111',
    });
    const b = await pipelineFingerprint({
      stage: 'queue',
      code: 'queue.chunk_failed',
      table: 'orders',
      message: 'fail user 22222222-2222-2222-2222-222222222222',
    });
    expect(a).toBe(b);
  });

  it('match runbook for dlq', () => {
    expect(matchPipelineRunbook('queue.dlq', 'queue', null)?.id).toBe('pipe.dlq');
  });

  it('retention_vs_fail recommendation when d1 watch and cron red', () => {
    const overview: PipelineOverviewDto = {
      cachedAt: new Date().toISOString(),
      stale: false,
      range: '1h',
      overall: 'incident',
      stages: [
        stage({ stage: 'do', status: 'healthy' }),
        stage({ stage: 'queue', status: 'healthy', metrics: { dlqPendingApprox: 0 } }),
        stage({ stage: 'd1', status: 'watch' }),
        stage({ stage: 'r2', status: 'incident' }),
      ],
      lag: {
        doPendingP50: null,
        doPendingP95: null,
        doFlushedStuckOverMin: null,
        queueDepthApprox: null,
        dlqPendingApprox: 0,
        e2eDoToD1Minutes: null,
        e2eD1ToR2Hours: null,
        watermarkSampleCount: null,
        confidence: 'low',
      },
      openCount: 0,
      new1h: 0,
      retentionDays: 96,
      lastCron: {
        id: 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        success: false,
        totalPipelines: 6,
        successful: 4,
        failed: 2,
      },
      sampleSize: 0,
      auxBuckets: [],
      dlqLoggedApprox: 0,
    };
    const incidents: PipelineIncident[] = [];
    const recs = buildPipelineRecommendations(incidents, overview);
    expect(recs.some((r) => r.id === 'pipe.stab.retention_vs_fail')).toBe(true);
    expect(recs.some((r) => r.id === 'pipe.stab.cron_red')).toBe(true);
  });

  it('phase2 table catalogs include archive + sync (no dead order_items)', () => {
    expect(PIPELINE_ARCHIVE_TABLES).toContain('service_usages');
    expect(PIPELINE_ARCHIVE_TABLES).toContain('orders');
    expect(PIPELINE_ARCHIVE_TABLES).not.toContain('order_items');
    expect(PIPELINE_ARCHIVE_TABLES).not.toContain('order_discounts');
    expect(SYNC_TABLE_NAMES).toContain('agent_workflows');
    expect(SYNC_TABLE_NAMES).toContain('orders');
  });
});

describe('pipeline-health actions validation', () => {
  it('forceFlush requires confirm and valid userId', async () => {
    const { forceFlushUser } = await import('./actions.js');
    const env = { SYSTEM_CONFIG_KV: undefined, USER_DO: undefined, D1DB: undefined } as unknown as Env;
    await expect(forceFlushUser(env, 'admin', { userId: 'a'.repeat(64) })).rejects.toMatchObject({
      code: 'confirm_required',
    });
    await expect(forceFlushUser(env, 'admin', { userId: 'bad', confirm: true })).rejects.toMatchObject({
      code: 'invalid_user_id',
    });
  });

  it('rerunPipeline requires confirm and valid archive table', async () => {
    const { rerunPipeline } = await import('./actions.js');
    const env = { SYSTEM_CONFIG_KV: undefined, D1DB: undefined } as unknown as Env;
    await expect(rerunPipeline(env, 'admin', { all: true })).rejects.toMatchObject({
      code: 'confirm_required',
    });
    await expect(rerunPipeline(env, 'admin', { table: 'users', confirm: true })).rejects.toMatchObject({
      code: 'invalid_table',
    });
  });

  it('replayDlq requires confirm and rejects missing entry', async () => {
    const { replayDlqEntry } = await import('./actions.js');
    const env = {
      SYSTEM_CONFIG_KV: undefined,
      INPUT_QUEUE: undefined,
      D1DB: undefined,
    } as unknown as Env;
    await expect(replayDlqEntry(env, 'admin', { id: 1 })).rejects.toMatchObject({
      code: 'confirm_required',
    });
    await expect(replayDlqEntry(env, 'admin', { id: 1, confirm: true })).rejects.toMatchObject({
      code: 'binding_missing',
    });
  });
});

describe('pipeline-health phase3 helpers', () => {
  it('exports DLQ replay limits', async () => {
    const { DLQ_REPLAY_DAILY_CAP, DLQ_REPLAY_MIN_INTERVAL_MS } = await import('./domain.js');
    expect(DLQ_REPLAY_DAILY_CAP).toBe(10);
    expect(DLQ_REPLAY_MIN_INTERVAL_MS).toBe(30_000);
  });
});
