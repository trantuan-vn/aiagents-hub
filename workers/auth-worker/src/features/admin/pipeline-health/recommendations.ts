import type {
  PipelineIncident,
  PipelineOverviewDto,
  PipelineRecommendation,
  StageHealth,
} from './domain.js';
import { PIPELINE_RUNBOOKS, matchPipelineRunbook } from './domain.js';

const SEVERITY_WEIGHT: Record<string, number> = { critical: 8, high: 4, medium: 2, low: 1 };
const EFFORT_WEIGHT: Record<string, number> = { S: 1, M: 2, L: 3 };

function recencyWeight(lastSeenIso: string, now = Date.now()): number {
  const ageH = Math.max(0, (now - Date.parse(lastSeenIso)) / 3_600_000);
  if (ageH < 1) return 4;
  if (ageH < 24) return 2;
  return 1;
}

function score(severity: string, lastSeen: string, volume: number, effort: 'S' | 'M' | 'L'): number {
  return (
    ((SEVERITY_WEIGHT[severity] ?? 1) * recencyWeight(lastSeen) * Math.log10(Math.max(volume, 1) + 1)) /
    (EFFORT_WEIGHT[effort] ?? 2)
  );
}

export function buildPipelineRecommendations(
  incidents: PipelineIncident[],
  overview: PipelineOverviewDto,
): PipelineRecommendation[] {
  const out: PipelineRecommendation[] = [];
  const open = incidents.filter((g) => g.status === 'new' || g.status === 'ack' || g.status === 'investigating');
  const stages = Object.fromEntries(overview.stages.map((s) => [s.stage, s])) as Record<string, StageHealth>;
  const queue = stages.queue;
  const doStage = stages.do;
  const r2 = stages.r2;
  const d1 = stages.d1;

  const dlq = Number(queue?.metrics.dlqPendingApprox ?? 0);
  if (dlq > 0 || open.some((i) => i.code === 'queue.dlq')) {
    out.push({
      id: 'pipe.stab.dlq',
      title: 'Dead-letter queue has entries',
      because: `DLQ depth ≈ ${dlq || 'signal'}. Poison messages stop DO→D1 sync for those rows.`,
      actions: ['Inspect queue.dlq incidents', 'Fix schema/unknown_table before retrying', 'Do not raise DLQ max_retries'],
      files: ['workers/queue-worker/src/index.ts'],
      effort: 'M',
      severity: 'critical',
      status: 'advisory',
      priorityScore: 50,
    });
  }

  const chunkFails = open.filter((i) => i.code === 'queue.chunk_failed');
  const chunk1h = chunkFails.reduce((n, i) => n + i.count1h, 0);
  if (chunk1h >= 3) {
    out.push({
      id: 'pipe.stab.chunk',
      title: 'Queue chunk insert failures',
      because: `${chunk1h} chunk_failed in 1h across ${chunkFails.length} fingerprint(s).`,
      actions: ['Compare D1 schema to Zod', 'Check queue-worker migrations', 'Open related Worker errors'],
      files: ['workers/queue-worker/src/database/index.ts'],
      effort: 'M',
      severity: 'critical',
      status: 'advisory',
      priorityScore: 45,
    });
  }

  if (r2?.status === 'incident' || (overview.lastCron && !overview.lastCron.success)) {
    out.push({
      id: 'pipe.stab.cron_red',
      title: 'd1tor2 cron is red',
      because: overview.lastCron
        ? `Last cron finished ${overview.lastCron.finishedAt} with ${overview.lastCron.failed}/${overview.lastCron.totalPipelines} failed.`
        : 'No successful cron run recorded (or stale).',
      actions: ['Fix pipeline endpoint / catalog token', 'Do not lower D1_RETENTION_DAYS while red', 'Check cron.pipeline_failed incidents'],
      files: ['workers/d1tor2-cron/src/pipelines/pipeline-manager.ts'],
      effort: 'M',
      severity: 'critical',
      status: 'advisory',
      priorityScore: 48,
    });
  }

  const pendingSum = Number(doStage?.metrics.pendingSampleSum ?? 0);
  const hotUsers = Number(doStage?.metrics.hotUsers ?? 0);
  if (pendingSum > 500 || hotUsers >= 5 || doStage?.status === 'incident') {
    out.push({
      id: 'pipe.stab.pending_high',
      title: 'DO pending backlog elevated',
      because: `Sample pending sum=${pendingSum}, hot users=${hotUsers}, DO status=${doStage?.status ?? 'unknown'}.`,
      actions: ['Probe hot users', 'Check auth_worker QUEUE_FLUSH_* in system-config', 'Verify UserDO alarms'],
      files: ['workers/auth-worker/src/features/ws/infrastructure/UserDO.ts'],
      effort: 'M',
      severity: 'high',
      status: 'advisory',
      priorityScore: 30,
    });
  }

  if (open.some((i) => i.code === 'queue.cleanup_failed')) {
    out.push({
      id: 'pipe.stab.cleanup_skew',
      title: 'Cleanup failed after D1 insert',
      because: 'D1 may already hold rows while UserDO still shows flushed/pending.',
      actions: ['Ack incident', 'Reconcile mark on UserDO (phase 2 force tools)', 'Avoid duplicate anxiety on reads'],
      files: ['workers/queue-worker/src/index.ts'],
      effort: 'S',
      severity: 'high',
      status: 'advisory',
      priorityScore: 28,
    });
  }

  const d1Watch = d1?.status === 'watch' || d1?.status === 'incident';
  if (d1Watch && (r2?.status === 'incident' || (overview.lastCron && !overview.lastCron.success))) {
    out.push({
      id: 'pipe.stab.retention_vs_fail',
      title: 'Do not cut retention while archive is failing',
      because: `D1 stage is ${d1?.status} and R2/cron is unhealthy. Lowering D1_RETENTION_DAYS risks data loss before lakehouse catch-up.`,
      actions: ['Keep retention', 'Fix cron first', 'Link system-config only after green run'],
      files: ['workers/web/src/app/(main)/dashboard/system-config'],
      effort: 'S',
      severity: 'critical',
      status: 'advisory',
      priorityScore: 55,
    });
  }

  if (open.some((i) => i.code === 'do.flush_oversized' || i.code === 'queue.pull_from_do_failed')) {
    out.push({
      id: 'pipe.stab.oversized',
      title: 'Oversized flush / pullFromDo issues',
      because: 'Large rows (e.g. agent_workflows) use pullFromDo; failures leave pending stuck.',
      actions: ['Confirm pullFromDo path', 'Inspect hot users with agent_workflows', 'Keep message budget ≤ 120KB'],
      files: ['workers/auth-worker/src/features/ws/infrastructure/queue-flush.ts'],
      effort: 'M',
      severity: 'high',
      status: 'advisory',
      priorityScore: 26,
    });
  }

  for (const g of open) {
    if (g.severity === 'critical' || (g.severity === 'high' && g.status === 'new' && g.count24h >= 3)) {
      const rb = matchPipelineRunbook(g.code, g.stage, g.tableName) ?? PIPELINE_RUNBOOKS.find((r) => r.id === g.runbookId);
      out.push({
        id: `pipe.inc:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: g.title,
        because: `${g.stage}/${g.code} — ${g.count24h} in 24h, last ${g.lastSeen}.`,
        actions: rb?.checks ?? ['Ack while investigating', 'Open Worker errors for same event'],
        files: rb?.files ?? [],
        effort: 'M',
        severity: g.severity,
        status: 'advisory',
        priorityScore: score(g.severity, g.lastSeen, g.count24h, 'M'),
      });
    }
  }

  out.sort((a, b) => b.priorityScore - a.priorityScore);
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
