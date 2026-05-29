import type { CreateOrder, Order } from "./schema";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export const FALLBACK_USD_VND = Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000");

export const FALLBACK_MIN_TOP_UP_VND = 1000;

export type MemberBillingParams = {
  usdVndRate: number;
  minTopUpVnd: number;
};

export async function fetchWalletBalance(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) return 0;
  const json: unknown = await response.json();
  if (!json || typeof json !== "object") return 0;
  const w = "walletBalance" in json ? (json as { walletBalance?: unknown }).walletBalance : undefined;
  return typeof w === "number" && !Number.isNaN(w) ? Math.max(0, w) : 0;
}

function parseMemberBillingJson(json: unknown): MemberBillingParams {
  if (!json || typeof json !== "object") {
    return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND };
  }
  const o = json as { usdVndRate?: unknown; minTopUpVnd?: unknown };
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
  return { usdVndRate, minTopUpVnd };
}

export async function fetchMemberBillingParams(): Promise<MemberBillingParams> {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/order/exchange-rate`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND };
    }
    const json: unknown = await response.json();
    return parseMemberBillingJson(json);
  } catch {
    return { usdVndRate: FALLBACK_USD_VND, minTopUpVnd: FALLBACK_MIN_TOP_UP_VND };
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

export async function postCancelOrder(orderId: number, cancelErrorFallback: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/dashboard/order/orders/${orderId}/cancel`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error((await response.text()) || cancelErrorFallback);
}
