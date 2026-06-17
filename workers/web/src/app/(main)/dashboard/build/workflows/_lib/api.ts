const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export interface AgentWorkflow {
  id?: number;
  name: string;
  description?: string;
  /** JSON string array of tag labels. */
  tags?: string;
  definition: string;
  isShared?: boolean;
  starCount?: number;
  starLabel?: string;
  communityStarAvg?: number;
  communityStarCount?: number;
  usageCount?: number;
  totalEarningsUsd?: number;
  status?: "draft" | "published";
  user_id?: string;
}

export function listMyWorkflows() {
  return apiFetch<{ workflows: AgentWorkflow[] }>("/dashboard/build/workflows");
}

export function listSharedWorkflows(params?: { limit?: number; offset?: number; starCount?: number; search?: string }) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.starCount) q.set("starCount", String(params.starCount));
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch<{ workflows: AgentWorkflow[]; hasMore: boolean }>(
    `/dashboard/build/workflows/shared${qs ? `?${qs}` : ""}`,
  );
}

export function getWorkflow(id: number) {
  return apiFetch<{ workflow: AgentWorkflow }>(`/dashboard/build/workflows/${id}`);
}

export function createWorkflow(data: Partial<AgentWorkflow>) {
  return apiFetch<{ workflow: AgentWorkflow }>("/dashboard/build/workflows", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateWorkflow(id: number, data: Partial<AgentWorkflow>) {
  return apiFetch<{ workflow: AgentWorkflow }>(`/dashboard/build/workflows/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteWorkflow(id: number) {
  return apiFetch<{ success: boolean }>(`/dashboard/build/workflows/${id}`, { method: "DELETE" });
}

export interface ExecutionStepLog {
  nodeId: string;
  nodeType: string;
  status: "success" | "error" | "skipped" | "pending_human";
  input?: unknown;
  output?: unknown;
  error?: string;
  costVnd?: number;
  durationMs?: number;
  attempts?: number;
}

export type WorkflowExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "pending_human"
  | "cancelled";

export interface WorkflowExecutionResult {
  status: WorkflowExecutionStatus;
  executionKey: string;
  workflowId: number;
  workflowOwnerId: string;
  output?: unknown;
  steps: ExecutionStepLog[];
  totalCostVnd: number;
  pendingNodeId?: string;
}

export interface WorkflowExecutionRecord {
  id: number;
  executionKey: string;
  workflowId: number;
  workflowOwnerId: string;
  workflowName?: string;
  status: WorkflowExecutionStatus;
  input?: string;
  output?: unknown;
  error?: string;
  totalCostVnd: number;
  stepCount: number;
  steps: ExecutionStepLog[];
  pendingNodeId?: string;
  startedAt: number;
  finishedAt?: number;
}

export function executeWorkflow(
  id: number,
  options?: {
    input?: string;
    variables?: Record<string, unknown>;
    autoApproveHumanReview?: boolean;
    ownerId?: string;
    entryNodeId?: string;
  },
) {
  const path =
    options?.ownerId && options.ownerId.length > 0
      ? `/dashboard/build/workflows/shared/${options.ownerId}/${id}/execute`
      : `/dashboard/build/workflows/${id}/execute`;
  return apiFetch<WorkflowExecutionResult>(path, {
    method: "POST",
    body: JSON.stringify({
      input: options?.input,
      variables: options?.variables,
      autoApproveHumanReview: options?.autoApproveHumanReview,
      entryNodeId: options?.entryNodeId,
    }),
  });
}

export function listWorkflowExecutions(id: number, limit = 50) {
  return apiFetch<{ executions: WorkflowExecutionRecord[] }>(
    `/dashboard/build/workflows/${id}/executions?limit=${limit}`,
  );
}

export interface WorkflowExecutionStats {
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

export interface WorkflowExecutionObservability {
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

export function getWorkflowExecutionStats(workflowId: number, limit = 50) {
  return apiFetch<{ stats: WorkflowExecutionStats }>(
    `/dashboard/build/workflows/${workflowId}/executions/stats?limit=${limit}`,
  );
}

export function getWorkflowExecution(executionKey: string) {
  return apiFetch<{
    execution: WorkflowExecutionRecord;
    observability: WorkflowExecutionObservability;
  }>(`/dashboard/build/workflows/executions/${executionKey}`);
}

export interface WorkflowCollabState {
  workflowId: number;
  definition: string;
  updatedAt: number;
  editorId: string;
  editorName?: string;
}

export function getWorkflowCollab(workflowId: number) {
  return apiFetch<{ state: WorkflowCollabState | null }>(
    `/dashboard/build/workflows/${workflowId}/collab`,
  );
}

export function publishWorkflowCollab(
  workflowId: number,
  body: { definition: string; editorId: string; editorName?: string },
) {
  return apiFetch<{ state: WorkflowCollabState }>(`/dashboard/build/workflows/${workflowId}/collab`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function resumeWorkflowExecution(
  executionKey: string,
  body: { decision: "approve" | "reject"; note?: string },
) {
  return apiFetch<WorkflowExecutionResult>(
    `/dashboard/build/workflows/executions/${executionKey}/resume`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// --- Triggers (cron + webhook) ---
export type WorkflowTriggerType = "cron" | "webhook" | "telegram" | "slack" | "discord";

export interface WorkflowTrigger {
  triggerId: string;
  ownerId: string;
  workflowId: number;
  type: WorkflowTriggerType;
  enabled: number;
  cronExpr: string | null;
  webhookToken: string | null;
  nodeId?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string;
  /** Workflow owner DO id — required as X-Client-ID when calling the webhook URL. */
  webhookClientId?: string;
  input: string | null;
  autoApproveHumanReview: number;
  lastRunMinute: string | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  createdAt: number;
  updatedAt: number;
}

export function listWorkflowTriggers(workflowId: number) {
  return apiFetch<{ triggers: WorkflowTrigger[] }>(
    `/dashboard/build/workflows/${workflowId}/triggers`,
  );
}

export function createWorkflowTrigger(
  workflowId: number,
  body: {
    type: WorkflowTriggerType;
    cronExpr?: string;
    input?: string;
    enabled?: boolean;
    autoApproveHumanReview?: boolean;
    nodeId?: string;
    webhookPath?: string;
  },
) {
  return apiFetch<{ trigger: WorkflowTrigger }>(
    `/dashboard/build/workflows/${workflowId}/triggers`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateWorkflowTrigger(
  triggerId: string,
  body: { enabled?: boolean; cronExpr?: string; input?: string; autoApproveHumanReview?: boolean },
) {
  return apiFetch<{ trigger: WorkflowTrigger }>(
    `/dashboard/build/workflows/triggers/${triggerId}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function deleteWorkflowTrigger(triggerId: string) {
  return apiFetch<{ success: boolean }>(`/dashboard/build/workflows/triggers/${triggerId}`, {
    method: "DELETE",
  });
}

// --- Credential vault ---
export type WorkflowCredentialType = "bearer" | "header" | "basic" | "query" | "none";

export interface WorkflowCredential {
  id: number;
  credentialKey: string;
  name: string;
  type: WorkflowCredentialType;
  meta: { headerName?: string; paramName?: string; username?: string };
  created_at?: number;
  updated_at?: number;
}

export function listWorkflowCredentials() {
  return apiFetch<{ credentials: WorkflowCredential[] }>(
    "/dashboard/build/workflows/credentials",
  );
}

export function createWorkflowCredential(body: {
  name: string;
  type: WorkflowCredentialType;
  secret?: string;
  meta?: { headerName?: string; paramName?: string; username?: string };
}) {
  return apiFetch<{ credential: WorkflowCredential }>(
    "/dashboard/build/workflows/credentials",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function deleteWorkflowCredential(id: number) {
  return apiFetch<{ success: boolean }>(`/dashboard/build/workflows/credentials/${id}`, {
    method: "DELETE",
  });
}

// --- Integration presets ---
export interface IntegrationPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  docsUrl: string;
  credentialType: WorkflowCredentialType;
  node: { method: string; url: string; headers?: Record<string, string>; body?: unknown; jsonResponse?: boolean };
}

export function listWorkflowIntegrations() {
  return apiFetch<{ integrations: IntegrationPreset[] }>(
    "/dashboard/build/workflows/integrations",
  );
}

export function workflowChatApiUrl(workflowId: number, ownerId?: string) {
  const q = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : "";
  if (ownerId) {
    return `/dashboard/build/workflows/shared/${ownerId}/${workflowId}/chat`;
  }
  return `/dashboard/build/workflows/${workflowId}/chat${q}`;
}

export function getSharedWorkflow(ownerId: string, workflowId: number) {
  return apiFetch<{ workflow: AgentWorkflow }>(`/dashboard/build/workflows/shared/${ownerId}/${workflowId}`);
}

export function listComments(ownerId: string, workflowId: number) {
  return apiFetch<{ comments: Record<string, unknown>[]; hasMore: boolean }>(
    `/dashboard/build/workflows/shared/${ownerId}/${workflowId}/comments`,
  );
}

export function postComment(
  ownerId: string,
  workflowId: number,
  body: { content: string; rating?: number; authorDisplayName?: string },
) {
  return apiFetch<{ comment: unknown }>(`/dashboard/build/workflows/shared/${ownerId}/${workflowId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getWorkflowStar(ownerId: string, workflowId: number) {
  return apiFetch<{ star: { starCount: number; label?: string } | null }>(
    `/dashboard/build/workflows/shared/${ownerId}/${workflowId}/star`,
  );
}

export function setWorkflowStar(ownerId: string, workflowId: number, body: { starCount: number; label?: string }) {
  return apiFetch<{ star: unknown }>(`/dashboard/build/workflows/shared/${ownerId}/${workflowId}/star`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getEarningsStats(period: number) {
  return apiFetch<{ byDay: { date: string; total: number }[]; totalAmount: number }>(
    `/dashboard/build/workflows/earnings/stats?period=${period}`,
  );
}

export function listEarnings(period: number, limit = 50, offset = 0) {
  return apiFetch<{ royalties: Record<string, unknown>[] }>(
    `/dashboard/build/workflows/earnings?period=${period}&limit=${limit}&offset=${offset}`,
  );
}

export interface WorkflowClosedPeriodRow {
  period: string;
  totalAmountUsd: number;
  payoutStatus: "pending" | "paid" | null;
}

export interface WorkflowEarningsMonthlySummary {
  currentPeriod: string;
  accruing: {
    period: string;
    totalAmountUsd: number;
    byDay: { date: string; total: number }[];
    royalties: Record<string, unknown>[];
  };
  closedPeriods: WorkflowClosedPeriodRow[];
  closedTotalAmountUsd: number;
}

export function getWorkflowEarningsMonthlySummary() {
  return apiFetch<WorkflowEarningsMonthlySummary>(
    "/dashboard/build/workflows/earnings/monthly-summary",
  );
}

// --- AI authoring: text-to-workflow + auto-fix ---
export interface GeneratedWorkflow {
  definition: {
    nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
    edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
    viewport?: { x: number; y: number; zoom: number };
  };
  notes: string;
}

export function generateWorkflow(prompt: string) {
  return apiFetch<GeneratedWorkflow>("/dashboard/build/workflows/generate", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function autofixWorkflow(id: number, body: { definition?: unknown; error?: string }) {
  return apiFetch<GeneratedWorkflow>(`/dashboard/build/workflows/${id}/autofix`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Version history ---
export interface WorkflowVersionRecord {
  id: number;
  versionKey: string;
  workflowId: number;
  version: number;
  label?: string;
  note?: string;
  definition: string;
  reason: string;
  createdAt?: number;
}

export function listWorkflowVersions(id: number) {
  return apiFetch<{ versions: WorkflowVersionRecord[] }>(
    `/dashboard/build/workflows/${id}/versions`,
  );
}

export function snapshotWorkflowVersion(id: number, body: { definition?: string; label?: string; note?: string }) {
  return apiFetch<{ version: WorkflowVersionRecord }>(`/dashboard/build/workflows/${id}/versions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function restoreWorkflowVersion(id: number, versionKey: string) {
  return apiFetch<{ workflow: AgentWorkflow; restoredVersion: number }>(
    `/dashboard/build/workflows/${id}/versions/${versionKey}/restore`,
    { method: "POST" },
  );
}

export interface WorkflowNodeCatalogEntry {
  id: string;
  addCategory: string;
  runtimeType: string;
  kind?: string;
  nameKey: string;
  descKey: string;
  hasBackend: boolean;
  hasFrontend: boolean;
  isActive: boolean;
  sortOrder?: number;
  updatedAt?: number;
}

export function listWorkflowNodeCatalog() {
  return apiFetch<{ entries: WorkflowNodeCatalogEntry[] }>("/dashboard/build/workflows/node-catalog");
}
