import { z } from "zod";

// Order Schemas
export const OrderStatusSchema = z.enum(["PENDING", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]);

export function createCreateOrderSchema(minTopUpVnd: number) {
  const m = Math.max(1, Math.floor(minTopUpVnd));
  return z.object({
    /** VND amount to credit after successful payment (before gateway discounts = policies + vouchers). */
    amount: z
      .number()
      .int("Amount must be a whole number")
      .min(m, `Amount must be at least ${m.toLocaleString("vi-VN")} VND`),
    currency: z.string().default("USD"),
    voucherCode: z.string().optional(),
    notes: z.string().optional(),
    paymentMethod: z.string().optional(),
  });
}

/** Minimum wallet top-up in USD (no exchange rate on the entry screen). */
export const MIN_TOP_UP_USD = 1;

/** Wallet top-up dialog: user enters USD (up to 2 decimals); VND is computed at payment. */
export function createUsdTopUpOrderSchema(minTopUpUsd: number) {
  const m = Math.max(0.01, minTopUpUsd);
  return z.object({
    amount: z
      .number()
      .positive("Amount must be greater than zero")
      .min(m, `Amount must be at least ${m} USD`)
      .refine((v) => Number.isInteger(Math.round(v * 100)), "Amount supports at most 2 decimal places"),
    currency: z.literal("USD").default("USD"),
    voucherCode: z.string().optional(),
    notes: z.string().optional(),
    paymentMethod: z.string().optional(),
  });
}

/** Format order timestamp for display (handles ISO string or Unix ms). */
export function formatOrderDate(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type CreateOrder = {
  amount: number;
  currency: string;
  voucherCode?: string;
  notes?: string;
  paymentMethod?: string;
};

export const OrderItemSchema = z.object({
  id: z.number().int(),
  orderId: z.number().int(),
  serviceId: z.number().int(),
  basePrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalAmount: z.number().min(0),
  quantity: z.number().min(1),
});

export const OrderSchema = z.object({
  id: z.number().int(),
  orderCode: z.string(),
  subtotalAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  /** USD wallet credit */
  finalAmount: z.number().min(0),
  /** VND payable at checkout */
  payableAmountVnd: z.number().int().min(0).optional(),
  status: OrderStatusSchema,
  currency: z.string().default("USD"),
  appliedVoucherCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OrderDetailSchema = OrderSchema.extend({
  items: z.array(OrderItemSchema),
  discounts: z.array(z.any()).optional(),
});

// Payment Schemas
export const CreatePaymentSchema = z.object({
  amount: z.number().min(1000, "Amount must be at least 1,000 VND"),
  bankCode: z.string(),
  language: z.enum(["vn", "en"]).default("vn"),
  orderId: z.number().int(),
});

export const PaymentResultSchema = z.object({
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  orderId: z.number().optional(),
  amount: z.number().optional(),
  transactionNo: z.string().optional(),
  bankCode: z.string().optional(),
});

// Types
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderDetail = z.infer<typeof OrderDetailSchema>;
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;
export type PaymentResult = z.infer<typeof PaymentResultSchema>;

/** VND amount for VNPay/Casso (legacy orders without payableAmountVnd). */
export function getOrderPayableVnd(
  order: Pick<Order, "finalAmount" | "payableAmountVnd" | "currency">,
  usdVndRate: number,
): number {
  const payable = order.payableAmountVnd;
  if (typeof payable === "number" && payable > 0) return Math.round(payable);
  const cur = (order.currency ?? "VND").toUpperCase();
  if (cur === "USD") {
    const rate = usdVndRate > 0 ? usdVndRate : 26000;
    return Math.round(order.finalAmount * rate);
  }
  return Math.round(order.finalAmount);
}
