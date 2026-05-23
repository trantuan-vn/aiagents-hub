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

export interface CommissionClosedPeriodRow {
  period: string;
  totalAmountUsd: number;
  payoutStatus: "pending" | "paid" | null;
}

export interface CommissionMonthlySummary {
  currentPeriod: string;
  accruing: {
    period: string;
    totalAmountUsd: number;
    byDay: { date: string; total: number }[];
    commissions: Record<string, unknown>[];
  };
  closedPeriods: CommissionClosedPeriodRow[];
  closedTotalAmountUsd: number;
}

export function getCommissionMonthlySummary() {
  return apiFetch<CommissionMonthlySummary>("/dashboard/referral/commissions/monthly-summary");
}
