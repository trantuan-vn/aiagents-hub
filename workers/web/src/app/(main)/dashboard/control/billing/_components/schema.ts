import { z } from "zod";

// Order Schemas
export const OrderStatusSchema = z.enum(["PENDING", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]);

export const CreateOrderItemSchema = z.object({
  serviceId: z.number().int().min(1, "Service ID is required"),
  basePrice: z.number().min(0, "Base price must be positive"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
});

export const CreateOrderSchema = z.object({
  items: z.array(CreateOrderItemSchema).min(1, "At least one item is required"),
  currency: z.string().default("VND"),
  voucherCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
});

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
export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderDetail = z.infer<typeof OrderDetailSchema>;
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;
export type PaymentResult = z.infer<typeof PaymentResultSchema>;
