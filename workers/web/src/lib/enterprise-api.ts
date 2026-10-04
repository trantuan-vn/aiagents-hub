"use client";

import { useCallback } from "react";

import { useTranslations } from "next-intl";

export const ENTERPRISE_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export class EnterpriseApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "EnterpriseApiError";
  }
}

export async function enterpriseCall<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${ENTERPRISE_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    throw new EnterpriseApiError(body.code ?? body.error ?? res.statusText ?? "ERROR", res.status);
  }
  return await res.json();
}

const call = enterpriseCall;

/** Translate an enterprise error code; unknown codes fall back to the raw message. */
export function useEnterpriseErrorMessage(): (err: unknown) => string {
  const t = useTranslations("Enterprise.errors");
  return useCallback(
    (err: unknown) => {
      const code = err instanceof EnterpriseApiError ? err.code : err instanceof Error ? err.message : String(err);
      return t.has(code as never) ? t(code as never) : code;
    },
    [t],
  );
}

export function enterpriseHookUrl(token: string): string {
  return `${ENTERPRISE_API_BASE}/hooks/enterprise/${token}`;
}

// --- Shared types -------------------------------------------------------------

export type EnterpriseStatus = "pending" | "active" | "suspended";
export type SeatRole = "business" | "pro";
export type EnterpriseAcceptance = "none" | "pending" | "accepted";
export type TriggerKind = "webhook" | "chat" | "form" | "schedule";
export type PlanInterval = 1 | 3 | 6 | 12;

export type EnterpriseFormField = {
  fieldName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options?: string[];
};

export type EnterpriseTrigger = {
  triggerKey: string;
  kind: TriggerKind;
  label: string;
  nodeId?: string;
  fields?: EnterpriseFormField[];
};

// --- Flag requests ---------------------------------------------------------------

export type FlagRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type FlagRequest = {
  id: string;
  workflowOwnerId: string;
  workflowId: number;
  note: string | null;
  status: FlagRequestStatus;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

// --- Owner -----------------------------------------------------------------------

export type OwnerWorkflowEnterprise = {
  id: number;
  name: string;
  status?: "draft" | "published";
  isShared?: boolean | number;
  isEnterprise?: boolean | number | null;
  enterpriseId?: string | null;
  enterpriseAcceptance?: EnterpriseAcceptance | null;
  acceptedRoyaltyPercent?: number | null;
};

export const ownerEnterprise = {
  workflow: (id: number) => call<{ workflow: OwnerWorkflowEnterprise }>(`/dashboard/build/workflows/${id}`),
  latestRequest: (id: number) =>
    call<{ request: FlagRequest | null }>(`/dashboard/build/workflows/${id}/enterprise-flag-request`),
  requestFlag: (id: number, note?: string) =>
    call<{ request: FlagRequest }>(`/dashboard/build/workflows/${id}/enterprise-flag-request`, {
      method: "POST",
      body: note ? { note } : {},
    }),
  withdrawFlag: (id: number) =>
    call<{ success: boolean }>(`/dashboard/build/workflows/${id}/enterprise-flag-request`, { method: "DELETE" }),
  propose: (id: number, enterpriseId: string | null) =>
    call<{ workflow: OwnerWorkflowEnterprise }>(`/dashboard/build/workflows/${id}`, {
      method: "PUT",
      body: { enterpriseId },
    }),
};

// --- Members: organization block ---------------------------------------------------

export type CatalogEnterprise = {
  id?: string;
  name: string;
  status: EnterpriseStatus;
  seatRole: SeatRole;
  seatActive: boolean;
  periodEnd: string | null;
  seatGraceUntil: string | null;
};

export type CatalogCard = {
  id: number;
  ownerId: string;
  ownerIdentifier: string | null;
  name: string;
  description: string | null;
  tags: string;
  royaltyPercent: number | null;
  triggers: EnterpriseTrigger[];
};

export type EnterpriseCatalog = {
  enterprise: CatalogEnterprise | null;
  workflows: CatalogCard[];
  proposals: CatalogCard[];
};

export type GrantsView = {
  triggers: EnterpriseTrigger[];
  proMembers: string[];
  grants: Array<{ granteeUserId: string; triggerKey: string; monthlyCreditCap: number | null; hasCredential: boolean }>;
};

export type IssuedCredential = { triggerKey: string; token: string };

export type EnterpriseRunResult = { status: string; executionKey: string; output?: unknown };

export type EnterpriseRunBody = {
  triggerKey: string;
  input?: string;
  fields?: Record<string, unknown>;
  sessionId?: string;
  chatInput?: string;
};

const wf = (ownerId: string, workflowId: number) => `/dashboard/build/workflows/enterprise/${ownerId}/${workflowId}`;

export const memberEnterprise = {
  catalog: () => call<EnterpriseCatalog>("/dashboard/build/workflows/enterprise"),
  decide: (ownerId: string, workflowId: number, decision: "accept" | "reject" | "release") =>
    call<{ success: boolean }>(`${wf(ownerId, workflowId)}/${decision}`, { method: "POST" }),
  grants: (ownerId: string, workflowId: number) => call<GrantsView>(`${wf(ownerId, workflowId)}/grants`),
  putGrants: (
    ownerId: string,
    workflowId: number,
    body: { granteeUserId: string; triggerKeys: string[]; monthlyCreditCap?: number | null },
  ) =>
    call<{
      granteeUserId: string;
      triggerKeys: string[];
      monthlyCreditCap: number | null;
      credentials: IssuedCredential[];
    }>(`${wf(ownerId, workflowId)}/grants`, { method: "PUT", body }),
  issueCredential: (ownerId: string, workflowId: number, body: { triggerKey: string; granteeUserId?: string }) =>
    call<{ triggerKey: string; granteeUserId: string; token: string }>(`${wf(ownerId, workflowId)}/credentials`, {
      method: "POST",
      body,
    }),
  execute: (ownerId: string, workflowId: number, body: EnterpriseRunBody) =>
    call<EnterpriseRunResult>(`${wf(ownerId, workflowId)}/execute`, { method: "POST", body }),
};

// --- Business: organization billing ------------------------------------------------

export type EnterpriseBillingSnapshot = {
  enterprise: {
    id: string;
    name: string;
    status: EnterpriseStatus;
    periodEnd: string | null;
    planInterval: number | null;
    seatGraceUntil: string | null;
    adminHold: boolean;
    minProSeats: number;
  };
  seats: Array<{
    userId: string;
    seatRole: SeatRole;
    excluded: "self_paid" | "admin_granted" | null;
    planId: string | null;
    planSource: string | null;
    planCurrentPeriodEnd: string | null;
  }>;
  billableBusiness: number;
  billablePro: number;
  thresholdMet: boolean;
  quotes: Record<string, number>;
  pendingInvoice: {
    id: string;
    kind: "period" | "seat";
    amountUsd: number;
    orderId: number | null;
    payerUserId: string;
    createdAt: string;
  } | null;
};

export type EnterpriseCheckout = { invoiceId: string; orderId: number; amountUsd: number; checkoutPath: string };

export const enterpriseBilling = {
  snapshot: () => call<EnterpriseBillingSnapshot>("/dashboard/enterprises/mine/billing"),
  checkout: (interval: PlanInterval) =>
    call<EnterpriseCheckout>("/dashboard/enterprises/mine/billing/checkout", { method: "POST", body: { interval } }),
  cancel: (invoiceId: string) =>
    call<{ success: boolean }>(`/dashboard/enterprises/mine/billing/checkout/${encodeURIComponent(invoiceId)}/cancel`, {
      method: "POST",
    }),
  addSeat: (userId: string) =>
    call<EnterpriseCheckout>("/dashboard/enterprises/mine/billing/seats", { method: "POST", body: { userId } }),
};

export function formatEnterpriseDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
