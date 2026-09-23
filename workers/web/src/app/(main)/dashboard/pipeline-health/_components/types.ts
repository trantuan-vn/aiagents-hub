export type TimeRangeId = "1h" | "6h" | "24h" | "7d";
export type PipelineStage = "do" | "queue" | "d1" | "r2";
export type StageStatus = "healthy" | "watch" | "incident" | "unknown" | "unavailable";
export type Severity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "new" | "ack" | "investigating" | "resolved" | "ignored";

export type StageHealth = {
  stage: PipelineStage;
  status: StageStatus;
  summary: string;
  metrics: Record<string, number | string | null>;
  sampled?: boolean;
};

export type PipelineLag = {
  doPendingP50: number | null;
  doPendingP95: number | null;
  doFlushedStuckOverMin: number | null;
  queueDepthApprox: number | null;
  dlqPendingApprox: number | null;
  e2eDoToD1Minutes: number | null;
  e2eD1ToR2Hours: number | null;
  confidence: "low" | "medium" | "high";
};

export type CronRunSummary = {
  id: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  totalPipelines: number;
  successful: number;
  failed: number;
  results?: Array<{
    pipelineName: string;
    tableName: string;
    success: boolean;
    recordsProcessed: number;
    error?: string;
  }>;
};

export type PipelineOverviewDto = {
  cachedAt: string;
  stale: boolean;
  range: TimeRangeId;
  overall: StageStatus;
  stages: StageHealth[];
  lag: PipelineLag;
  openCount: number;
  new1h: number;
  retentionDays: number;
  lastCron: CronRunSummary | null;
  sampleSize: number;
  telemetryError?: string;
  queuesError?: string;
};

export type PipelineIncident = {
  fingerprint: string;
  stage: PipelineStage;
  code: string;
  tableName: string | null;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  count1h: number;
  count24h: number;
  countRange: number;
  firstSeen: string;
  lastSeen: string;
  runbookId: string | null;
  excerpt: string | null;
  relatedWorkerFingerprint: string | null;
};

export type PipelineRecommendation = {
  id: string;
  fingerprint?: string;
  title: string;
  because: string;
  actions: string[];
  files: string[];
  effort: "S" | "M" | "L";
  severity: Severity;
  status: "advisory";
};

export type TableHealthRow = {
  table: string;
  sync: boolean;
  archive: boolean;
  cleanup: boolean;
  incidentCount: number;
  lastCronSuccess: boolean | null;
  lastCronAt: string | null;
  lastCronError: string | null;
};

export type HotUserRow = {
  userId: string;
  reason: string;
  pendingApprox: number | null;
  lastSignalAt: string;
  lastTable: string | null;
};

export type UserDoHealthDto = {
  userId: string;
  status: string;
  pendingTotal: number;
  processedTotal: number;
  unhealthyTables: number;
  tables?: Array<{ table: string; pending: number; flushed: number; processed: number }>;
};

export type ApiError = { error?: string; code?: string };

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function statusClass(status: string): string {
  if (status === "incident") return "border-destructive/50 bg-destructive/5";
  if (status === "watch") return "border-amber-500/40 bg-amber-500/5";
  if (status === "unavailable" || status === "unknown") return "border-muted";
  return "";
}
