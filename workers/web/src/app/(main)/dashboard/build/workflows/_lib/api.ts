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
  slug: string;
  definition: string;
  isShared?: boolean;
  starCount?: number;
  starLabel?: string;
  communityStarAvg?: number;
  communityStarCount?: number;
  usageCount?: number;
  totalEarningsVnd?: number;
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
}

export interface WorkflowExecutionResult {
  status: "completed" | "failed" | "pending_human";
  workflowId: number;
  workflowOwnerId: string;
  output?: unknown;
  steps: ExecutionStepLog[];
  totalCostVnd: number;
}

export function executeWorkflow(
  id: number,
  options?: {
    input?: string;
    variables?: Record<string, unknown>;
    autoApproveHumanReview?: boolean;
    ownerId?: string;
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
    }),
  });
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
