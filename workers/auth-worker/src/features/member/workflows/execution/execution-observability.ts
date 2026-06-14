import type { ExecutionRow } from './execution-store.js';
import type { ExecutionStepLog } from '../executor.js';

export interface ExecutionStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pendingHuman: number;
  cancelled: number;
  successRate: number;
  avgCostVnd: number;
  avgDurationMs: number;
  lastRunAt: number | null;
}

export interface StepTimelineEntry {
  nodeId: string;
  nodeType: string;
  status: string;
  durationMs: number;
  costVnd: number;
  error?: string;
  offsetMs: number;
}

export interface ExecutionObservability {
  executionKey: string;
  workflowId: number;
  status: string;
  startedAt: number;
  finishedAt?: number;
  totalDurationMs: number;
  totalCostVnd: number;
  stepCount: number;
  steps: ExecutionStepLog[];
  timeline: StepTimelineEntry[];
  error?: string;
}

function parseStepsFromState(stateStr: string | undefined): ExecutionStepLog[] {
  if (!stateStr) return [];
  try {
    const parsed = JSON.parse(stateStr) as { engine?: { steps?: ExecutionStepLog[] } };
    return Array.isArray(parsed.engine?.steps) ? parsed.engine.steps : [];
  } catch {
    return [];
  }
}

export function computeExecutionStats(rows: ExecutionRow[]): ExecutionStats {
  const total = rows.length;
  const completed = rows.filter((r) => r.status === 'completed').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const running = rows.filter((r) => r.status === 'running').length;
  const pendingHuman = rows.filter((r) => r.status === 'pending_human').length;
  const cancelled = rows.filter((r) => r.status === 'cancelled').length;
  const finished = rows.filter((r) => r.finishedAt && r.startedAt);
  const avgDurationMs =
    finished.length > 0
      ? Math.round(
          finished.reduce((sum, r) => sum + ((r.finishedAt ?? 0) - (r.startedAt ?? 0)), 0) /
            finished.length,
        )
      : 0;
  const avgCostVnd =
    total > 0 ? Math.round(rows.reduce((sum, r) => sum + (r.totalCostVnd ?? 0), 0) / total) : 0;
  const lastRunAt = rows.length > 0 ? Math.max(...rows.map((r) => r.startedAt ?? 0)) : null;
  const terminal = completed + failed + cancelled;
  const successRate = terminal > 0 ? Math.round((completed / terminal) * 100) : 0;

  return {
    total,
    completed,
    failed,
    running,
    pendingHuman,
    cancelled,
    successRate,
    avgCostVnd,
    avgDurationMs,
    lastRunAt,
  };
}

export function buildStepTimeline(steps: ExecutionStepLog[]): StepTimelineEntry[] {
  let offset = 0;
  return steps.map((s) => {
    const durationMs = s.durationMs ?? 0;
    const entry: StepTimelineEntry = {
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      status: s.status,
      durationMs,
      costVnd: s.costVnd ?? 0,
      error: s.error,
      offsetMs: offset,
    };
    offset += durationMs;
    return entry;
  });
}

export function buildExecutionObservability(row: ExecutionRow, steps?: ExecutionStepLog[]): ExecutionObservability {
  const resolvedSteps = steps ?? parseStepsFromState(row.state);
  const timeline = buildStepTimeline(resolvedSteps);
  const stepDurationSum = timeline.reduce((sum, t) => sum + t.durationMs, 0);
  const wallDuration =
    row.finishedAt && row.startedAt ? row.finishedAt - row.startedAt : stepDurationSum;

  return {
    executionKey: row.executionKey,
    workflowId: row.workflowId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    totalDurationMs: wallDuration,
    totalCostVnd: row.totalCostVnd ?? 0,
    stepCount: row.stepCount ?? resolvedSteps.length,
    steps: resolvedSteps,
    timeline,
    error: row.error,
  };
}
