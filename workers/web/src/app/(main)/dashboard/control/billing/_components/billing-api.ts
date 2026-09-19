import type { CreateOrder, Order } from "./schema";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export const FALLBACK_USD_VND = Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000");

export const FALLBACK_MIN_TOP_UP_VND = 1000;

export type MemberBillingParams = {
  usdVndRate: number;
  minTopUpVnd: number;
  creditPriceUsd: number;
};

export async function fetchWalletBalance(): Promise<number> {
  const snap = await fetchWalletSnapshot();
  return snap.creditBalance;
}

export type CoeffNotice = {
  modelClass: string;
  emergency: boolean;
  effectiveAt: string;
  deltaPct: number;
};

export type CreditLotView = {
  remaining: number;
  credits: number;
  expiresAt: string | null;
  source: "purchased" | "included" | "grace";
};

export type WalletSnapshot = {
  creditBalance: number;
  creditsExpiring: string | null;
  creditLots: CreditLotView[];
  planId: "free" | "starter" | "pro" | "business";
  canBuyCredits: boolean;
  workflowRunsToday: number;
  workflowRunsRemaining: number | null;
  notices: CoeffNotice[];
  planStatus?: string | null;
  planCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  billingEnabled?: boolean;
  planSource?: string | null;
  planInterval?: number | null;
  paypalSubscriptionId?: string | null;
};

const PLAN_LIST_USD: Record<Exclude<WalletSnapshot["planId"], "free">, number> = {
  starter: 4.9,
  pro: 19.9,
  business: 99.9,
};

const INTERVAL_DISCOUNT: Record<1 | 3 | 6 | 12, number> = { 1: 0, 3: 0.1, 6: 0.15, 12: 0.2 };

export function planRenewalUsd(planId: WalletSnapshot["planId"], interval: 1 | 3 | 6 | 12): number {
  if (planId === "free") return 0;
  const list = PLAN_LIST_USD[planId];
  return Math.round(list * interval * (1 - INTERVAL_DISCOUNT[interval]) * 100) / 100;
}

function parsePlanId(raw: unknown): "free" | "starter" | "pro" | "business" {
  const s = String(raw ?? "").toLowerCase();
  if (s === "starter" || s === "pro" || s === "business") return s;
  if (s === "enterprise") return "business";
  return "free";
}

function parseNotices(raw: unknown): CoeffNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const o = row as Record<string, unknown>;
      return {
        modelClass: String(o.modelClass ?? ""),
        emergency: o.emergency === true,
        effectiveAt: typeof o.effectiveAt === "string" ? o.effectiveAt : "",
        deltaPct: typeof o.deltaPct === "number" ? o.deltaPct : 0,
      };
    })
    .filter((n) => n.modelClass);
}

function parseCreditLots(raw: unknown): CreditLotView[] {
  if (!Array.isArray(raw)) return [];
  const lots: CreditLotView[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const remaining = typeof o.remaining === "number" && Number.isFinite(o.remaining) ? o.remaining : 0;
    if (remaining <= 0) continue;
    const source = o.source === "included" || o.source === "grace" ? o.source : "purchased";
    const expiresAt = typeof o.expiresAt === "string" && o.expiresAt ? o.expiresAt : null;
    if (source !== "purchased" && !expiresAt) continue;
    const credits = typeof o.credits === "number" && Number.isFinite(o.credits) ? o.credits : remaining;
    const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const expiryDay =
      source === "purchased" || Number.isNaN(expiryMs) ? "never" : new Date(expiryMs).toISOString().slice(0, 10);
    const key = `${source}:${expiryDay}`;
    const existing = lots.find((lot) => {
      const existingMs = lot.expiresAt ? Date.parse(lot.expiresAt) : Number.NaN;
      const day =
        lot.source === "purchased" || Number.isNaN(existingMs)
          ? "never"
          : new Date(existingMs).toISOString().slice(0, 10);
      return `${lot.source}:${day}` === key;
    });
    if (existing) {
      existing.remaining += remaining;
      existing.credits += credits;
      continue;
    }
    lots.push({ remaining, credits, expiresAt: source === "purchased" ? null : expiresAt, source });
  }
  return lots.sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return 0;
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return a.expiresAt.localeCompare(b.expiresAt);
  });
}

export async function fetchWalletSnapshot(): Promise<WalletSnapshot> {
  const empty: WalletSnapshot = {
    creditBalance: 0,
    creditsExpiring: null,
    creditLots: [],
    planId: "free",
    canBuyCredits: false,
    workflowRunsToday: 0,
    workflowRunsRemaining: null,
    notices: [],
  };
  const response = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) return empty;
  const json: unknown = await response.json();
  if (!json || typeof json !== "object") return empty;
  const o = json as Record<string, unknown>;
  const raw = typeof o.creditBalance === "number" ? o.creditBalance : o.walletBalance;
  const creditBalance = typeof raw === "number" && !Number.isNaN(raw) ? Math.max(0, raw) : 0;
  const creditsExpiring = typeof o.creditsExpiring === "string" && o.creditsExpiring ? o.creditsExpiring : null;
  const remaining = o.workflowRunsRemaining;
  return {
    creditBalance,
    creditsExpiring,
    creditLots: parseCreditLots(o.creditLots),
    planId: parsePlanId(o.planId),
    canBuyCredits: o.canBuyCredits === true,
    workflowRunsToday: typeof o.workflowRunsToday === "number" ? Math.max(0, o.workflowRunsToday) : 0,
    workflowRunsRemaining: typeof remaining === "number" ? Math.max(0, remaining) : remaining === null ? null : null,
    notices: parseNotices(o.notices),
    planStatus: typeof o.planStatus === "string" ? o.planStatus : null,
    planCurrentPeriodEnd: typeof o.planCurrentPeriodEnd === "string" ? o.planCurrentPeriodEnd : null,
    cancelAtPeriodEnd: o.cancelAtPeriodEnd === true,
    billingEnabled: o.billingEnabled === true,
    planSource: typeof o.planSource === "string" ? o.planSource : null,
    planInterval:
      o.planInterval === 3 || o.planInterval === 6 || o.planInterval === 12 || o.planInterval === 1
        ? o.planInterval
        : null,
    paypalSubscriptionId: typeof o.paypalSubscriptionId === "string" && o.paypalSubscriptionId ? o.paypalSubscriptionId : null,
  };
}

function parseMemberBillingJson(json: unknown): MemberBillingParams {
  if (!json || typeof json !== "object") {
    return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND, creditPriceUsd: 0.0077 };
  }
  const o = json as { usdVndRate?: unknown; minTopUpVnd?: unknown; creditPriceUsd?: unknown };
  const usdVndRate =
    typeof o.usdVndRate === "number" && !Number.isNaN(o.usdVndRate) && o.usdVndRate >= 1
      ? o.usdVndRate
      : FALLBACK_USD_VND;
  const minTopUpVnd =
    typeof o.minTopUpVnd === "number" &&
    !Number.isNaN(o.minTopUpVnd) &&
    Number.isInteger(o.minTopUpVnd) &&
    o.minTopUpVnd >= 1
      ? o.minTopUpVnd
      : FALLBACK_MIN_TOP_UP_VND;
  const creditPriceUsd =
    typeof o.creditPriceUsd === "number" && !Number.isNaN(o.creditPriceUsd) && o.creditPriceUsd > 0
      ? o.creditPriceUsd
      : 0.0077;
  return { usdVndRate, minTopUpVnd, creditPriceUsd };
}

export async function fetchMemberBillingParams(): Promise<MemberBillingParams> {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/order/exchange-rate`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND, creditPriceUsd: 0.0077 };
    }
    const json: unknown = await response.json();
    return parseMemberBillingJson(json);
  } catch {
    return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND, creditPriceUsd: 0.0077 };
  }
}

export async function fetchUsdVndRate(): Promise<number> {
  const p = await fetchMemberBillingParams();
  return p.usdVndRate;
}

export async function loadHistoryFromApi(
  limit: number,
  offset: number,
  dateParams?: { fromDate: string; toDate: string },
): Promise<{ orders: Order[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  if (dateParams?.fromDate) params.append("fromDate", dateParams.fromDate);
  if (dateParams?.toDate) params.append("toDate", dateParams.toDate);
  const response = await fetch(`${API_BASE_URL}/dashboard/order/history?${params}`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function requestVnpayPaymentUrl(
  orderId: number,
  amount: number,
  bankCode: string,
  language: string,
  paymentErrorFallback: string,
  invalidUrlFallback: string,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/dashboard/vnpay/create_payment_url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, amount, bankCode, language }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || paymentErrorFallback);
  }
  const result: unknown = await response.json();
  if (
    result &&
    typeof result === "object" &&
    "paymentUrl" in result &&
    typeof (result as { paymentUrl: unknown }).paymentUrl === "string"
  ) {
    return (result as { paymentUrl: string }).paymentUrl;
  }
  throw new Error(invalidUrlFallback);
}

export async function fetchPaypalConfig(): Promise<{ clientId: string; enabled: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/paypal/config`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return { clientId: "", enabled: false };
    const json: unknown = await response.json();
    if (json && typeof json === "object") {
      const o = json as { clientId?: unknown; enabled?: unknown };
      const clientId = typeof o.clientId === "string" ? o.clientId : "";
      return { clientId, enabled: clientId.length > 0 && o.enabled === true };
    }
    return { clientId: "", enabled: false };
  } catch {
    return { clientId: "", enabled: false };
  }
}

export async function createPaypalOrder(orderId: number, paymentErrorFallback: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/dashboard/paypal/create_order`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || paymentErrorFallback);
  }
  const result: unknown = await response.json();
  if (
    result &&
    typeof result === "object" &&
    "paypalOrderId" in result &&
    typeof (result as { paypalOrderId: unknown }).paypalOrderId === "string"
  ) {
    return (result as { paypalOrderId: string }).paypalOrderId;
  }
  throw new Error(paymentErrorFallback);
}

export async function capturePaypalOrder(
  orderId: number,
  paypalOrderId: string,
  paymentErrorFallback: string,
): Promise<{ success: boolean; orderId: number; creditedUsd: number }> {
  const response = await fetch(`${API_BASE_URL}/dashboard/paypal/capture_order`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, paypalOrderId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || paymentErrorFallback);
  }
  const result: unknown = await response.json();
  if (result && typeof result === "object" && "success" in result) {
    return result as { success: boolean; orderId: number; creditedUsd: number };
  }
  throw new Error(paymentErrorFallback);
}

export async function startPaypalSubscribe(
  params: {
    planId: "starter" | "pro" | "business";
    interval: 1 | 3 | 6 | 12;
    returnOrderId?: number;
    startTime?: string;
  },
  errorFallback: string,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/dashboard/billing/subscriptions/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: params.planId,
      interval: params.interval,
      method: "subscription",
      ...(params.returnOrderId ? { returnOrderId: params.returnOrderId } : {}),
      ...(params.startTime ? { startTime: params.startTime } : {}),
    }),
  });
  const json = (await response.json()) as { approvalUrl?: string; error?: string };
  if (!response.ok || !json.approvalUrl) {
    throw new Error(json.error || errorFallback);
  }
  return json.approvalUrl;
}

export async function requestCassoQr(
  orderId: number,
  amount: number,
  paymentErrorFallback: string,
  invalidQrFallback: string,
): Promise<{ qr: string }> {
  const response = await fetch(`${API_BASE_URL}/dashboard/vnpay/casso_qr`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, amount }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || paymentErrorFallback);
  }
  const result: unknown = await response.json();
  if (result && typeof result === "object" && "qr" in result && typeof (result as { qr: unknown }).qr === "string") {
    return { qr: (result as { qr: string }).qr };
  }
  throw new Error(invalidQrFallback);
}

export async function fetchOrdersList(query: {
  status?: string;
  page: number;
  limit: number;
  fetchErrorFallback: string;
}): Promise<Order[]> {
  const params = new URLSearchParams();
  if (query.status) params.append("status", query.status);
  params.append("page", query.page.toString());
  params.append("limit", query.limit.toString());
  const qs = params.toString();
  const response = await fetch(`${API_BASE_URL}/dashboard/order/orders${qs ? `?${qs}` : ""}`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error((await response.text()) || query.fetchErrorFallback);
  return response.json();
}

export async function fetchAvailableVouchers(basePriceUsd: number): Promise<
  Array<{ code: string; name: string; discountPercent?: number; estimatedDiscount?: number }>
> {
  const params = new URLSearchParams({ basePrice: String(basePriceUsd) });
  const response = await fetch(`${API_BASE_URL}/dashboard/admin/voucher/available?${params}`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) return [];
  const json: unknown = await response.json();
  return Array.isArray(json) ? (json as Array<{ code: string; name: string; discountPercent?: number; estimatedDiscount?: number }>) : [];
}

export async function postCreateOrder(data: CreateOrder, createErrorFallback: string): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/dashboard/order/orders`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error((await response.text()) || createErrorFallback);
  return response.json();
}

export function parseCreatedOrderId(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested = o.order && typeof o.order === "object" ? (o.order as Record<string, unknown>).id : undefined;
  for (const value of [o.id, nested]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const n = Number(value);
      if (n > 0) return n;
    }
  }
  return null;
}

export async function postCancelOrder(orderId: number, cancelErrorFallback: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/dashboard/order/orders/${orderId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error((await response.text()) || cancelErrorFallback);
}
