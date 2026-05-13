import type { Order } from "./schema";

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
