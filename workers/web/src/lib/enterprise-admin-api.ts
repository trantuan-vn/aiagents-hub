"use client";

import {
  enterpriseCall as call,
  type EnterpriseAcceptance,
  type EnterpriseStatus,
  type FlagRequest,
  type SeatRole,
} from "./enterprise-api";

// --- Admin: organizations -------------------------------------------------------

export type AdminEnterprise = {
  id: string;
  name: string;
  status: EnterpriseStatus;
  minProSeats: number;
  periodEnd: string | null;
  planInterval: number | null;
  seatGraceUntil: string | null;
  adminHold: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminEnterpriseListItem = AdminEnterprise & {
  billableBusiness: number;
  billablePro: number;
  activeBusiness: number;
  activePro: number;
  workflows: { pending: number; accepted: number };
};

export type AdminEnterpriseDetail = {
  enterprise: AdminEnterprise;
  members: Array<{ userId: string; seatRole: SeatRole; createdAt: string }>;
  invoices: Array<{
    id: string;
    kind: "period" | "seat";
    status: "pending" | "paid" | "cancelled" | "expired";
    amount_usd: number;
    payer_user_id: string;
    period_end: string | null;
    created_at: string;
    paid_at: string | null;
  }>;
  workflows: { pending: number; accepted: number };
};

export const adminEnterprises = {
  list: () => call<{ enterprises: AdminEnterpriseListItem[] }>("/dashboard/admin/enterprises"),
  get: (id: string) => call<AdminEnterpriseDetail>(`/dashboard/admin/enterprises/${encodeURIComponent(id)}`),
  create: (body: { name: string; minProSeats: number; note?: string }) =>
    call<{ enterprise: AdminEnterprise }>("/dashboard/admin/enterprises", { method: "POST", body }),
  patch: (id: string, body: { name?: string; minProSeats?: number; note?: string | null; adminHold?: boolean }) =>
    call<{ enterprise: AdminEnterprise }>(`/dashboard/admin/enterprises/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),
  remove: (id: string) =>
    call<{ success: boolean }>(`/dashboard/admin/enterprises/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addMember: (id: string, body: { userId: string; seatRole: SeatRole }) =>
    call<{ member: unknown }>(`/dashboard/admin/enterprises/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body,
    }),
  removeMember: (id: string, userId: string) =>
    call<{ success: boolean }>(
      `/dashboard/admin/enterprises/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),
};

// --- Admin: flag requests and flagged workflows ----------------------------------

export type AdminFlagRequestListItem = FlagRequest & {
  ownerIdentifier: string | null;
  workflow: { name: string; status: string; isShared: boolean } | null;
};

export type AdminFlagRequestDetail = {
  request: FlagRequest;
  workflow: {
    id: number;
    ownerId: string;
    name: string;
    description: string | null;
    tags: string;
    definition: string;
    status: string;
    isShared: boolean;
    isEnterprise: boolean;
  };
};

export type AdminEnterpriseWorkflow = {
  ownerId: string;
  ownerIdentifier: string | null;
  workflowId: number;
  name: string;
  status: string;
  isShared: boolean;
  enterpriseId: string | null;
  enterpriseName: string | null;
  enterpriseAcceptance: EnterpriseAcceptance;
};

export const adminFlags = {
  list: () => call<{ requests: AdminFlagRequestListItem[] }>("/dashboard/admin/enterprise-flag-requests"),
  get: (id: string) =>
    call<AdminFlagRequestDetail>(`/dashboard/admin/enterprise-flag-requests/${encodeURIComponent(id)}`),
  approve: (id: string) =>
    call<{ success: boolean }>(`/dashboard/admin/enterprise-flag-requests/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    }),
  reject: (id: string, reason: string) =>
    call<{ success: boolean }>(`/dashboard/admin/enterprise-flag-requests/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: { reason },
    }),
  workflows: () => call<{ workflows: AdminEnterpriseWorkflow[] }>("/dashboard/admin/workflows/enterprise"),
  setFlag: (ownerId: string, workflowId: number, body: { isEnterprise: boolean; force?: boolean }) =>
    call<{ success: boolean }>(`/dashboard/admin/workflows/${ownerId}/${workflowId}/enterprise`, {
      method: "PUT",
      body,
    }),
};
