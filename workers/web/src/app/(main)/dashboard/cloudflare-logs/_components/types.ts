export type TimeRangeId = "1h" | "6h" | "24h" | "7d";
export type Severity = "critical" | "high" | "medium" | "low";
export type GroupStatus = "new" | "ack" | "investigating" | "resolved" | "ignored";
export type HealthStatus = "ok" | "watch" | "incident" | "unavailable";

export type LogsApiError = { error?: string; code?: string };

export type WorkerHealth = {
  scriptName: string;
  requests: number;
  graphqlErrors: number;
  observabilityErrors: number | null;
  observabilityEvents: number | null;
  errorRatePct: number | null;
  http5xx: number | null;
  cpuMsP50: number | null;
  cpuMsP99: number | null;
  sparkline: number[];
  status: HealthStatus;
  sampled: boolean;
};

export type SamplingDigest = {
  scriptName: string;
  enabled: boolean;
  headSamplingRate: number | null;
  sampled: boolean;
};

export type LogsOverviewDto = {
  cachedAt: string;
  stale: boolean;
  range: TimeRangeId;
  workers: WorkerHealth[];
  openCount: number;
  new1h: number;
  sampling: SamplingDigest[];
  telemetryError?: string;
  graphqlError?: string;
};

export type ErrorGroup = {
  fingerprint: string;
  title: string;
  scriptName: string;
  component: string | null;
  event: string | null;
  severity: Severity;
  status: GroupStatus;
  count1h: number;
  count24h: number;
  countRange: number;
  firstSeen: string;
  lastSeen: string;
  source: "hub_index" | "live_cf" | "dlq";
  runbookId: string | null;
  excerpt: string | null;
  sampled: boolean;
};

export type GroupNote = {
  at: string;
  actor: string;
  status: GroupStatus | null;
  note: string | null;
};

export type StabilityRecommendation = {
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

export type LogEventDto = {
  id: string;
  ts: string;
  scriptName: string;
  level: string;
  outcome: string | null;
  httpStatus: number | null;
  event: string | null;
  message: string;
  invocationId: string | null;
  payload: Record<string, unknown>;
};

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

export function shortScript(name: string): string {
  return name.replace(/^aiagents-hub-/, "");
}
