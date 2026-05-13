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
    currency: z.string().default("VND"),
    voucherCode: z.string().optional(),
    notes: z.string().optional(),
    paymentMethod: z.string().optional(),
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
  finalAmount: z.number().min(0),
  status: OrderStatusSchema,
  currency: z.string().default("VND"),
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
