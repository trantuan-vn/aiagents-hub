export const BANK_CODES = [
  { value: "VNPAYQR", label: "Thanh toán quét mã QR" },
  { value: "VNBANK", label: "Thẻ ATM - Tài khoản ngân hàng nội địa" },
  { value: "INTCARD", label: "Thẻ thanh toán quốc tế" },
] as const;

/** Bật khi set `NEXT_PUBLIC_ENABLE_VNPAY_BILLING=true` (VNPay production). */
export const IS_VNPAY_PAYMENT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_VNPAY_BILLING === "true";

export const PAYMENT_TABS_LIST_CLASS =
  "border-border bg-muted/40 grid h-auto w-full grid-cols-3 gap-1 rounded-lg border p-1";

export const PAYMENT_TAB_TRIGGER_CLASS =
  "border-border/70 data-[state=active]:border-primary data-[state=active]:bg-background bg-background/60 rounded-md border data-[state=active]:shadow-sm";

export type PaymentMethodTab = "vnpay" | "casso" | "stripe";

export function formatPaymentCurrency(amount: number, currency: string = "VND"): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount);
}
