export const PAYMENT_IPN_KIND = "payment_ipn";

export type PaymentIpnEvent = {
  orderId: number;
  paymentId?: number;
  status: "success" | "failed";
};

/** Parse a `broadcast` WS payload (same channel as notifications). */
export function parsePaymentIpnBroadcast(data: unknown): PaymentIpnEvent | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const outer = data as Record<string, unknown>;
  const nested = outer.data;
  const payload =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : outer;
  if (payload.kind !== PAYMENT_IPN_KIND) return null;
  const orderId = Number(payload.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) return null;
  const status = payload.status === "failed" ? "failed" : payload.status === "success" ? "success" : null;
  if (!status) return null;
  const paymentId = Number(payload.paymentId);
  return {
    orderId,
    status,
    paymentId: Number.isFinite(paymentId) && paymentId > 0 ? paymentId : undefined,
  };
}
