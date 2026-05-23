import { z } from 'zod';

import { convertUsdToVnd } from '../../admin/service/pricing';

// Common Schemas
export const OrderStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']);
export const DiscountTypeSchema = z.enum([
  'POLICY',
  'VOUCHER',
  'USER_PRICE',
  'USER_VOUCHER',
  'SERVICE_PRICE',
  'SERVICE_VOUCHER',
]);

// Main Schemas
export const OrderSchema = z.object({
  orderCode: z.string(),
  /** USD — wallet credit after successful payment */
  subtotalAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalAmount: z.number().min(0),
  /** VND payable via VNPay/Casso (frozen at order creation) */
  payableAmountVnd: z.number().int().min(0).optional(),
  status: OrderStatusSchema,
  currency: z.string().default('USD'),
  appliedVoucherCode: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional().nullable(),
});

export const OrderItemSchema = z.object({
  orderId: z.number().int(),
  /** 0 = wallet top-up line */
  serviceId: z.number().int().min(0),
  basePrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalAmount: z.number().min(0),
  quantity: z.number().min(1),
});

export const OrderItemDiscountSchema = z.object({
  orderItemId: z.number().int(),
  discountType: DiscountTypeSchema,
  discountAmount: z.number().min(0),
  appliedPolicies: z.array(z.object({
    policyId: z.number().int(),
    policyName: z.string(),
    discount: z.number(),
    type: z.string(),
  })).optional(),  
  appliedVoucherCode: z.string().optional(),
  description: z.string().optional(),
});

/** Wallet top-up request (USD or legacy VND). */
export const CreateOrderSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  voucherCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
});

const MIN_TOP_UP_USD = 1;

/** Validates create-order JSON. USD top-ups are stored as entered; VND uses `minTopUpVnd` from config. */
export function parseCreateOrderRequest(body: unknown, minTopUpVnd: number): CreateOrder {
  const parsed = CreateOrderSchema.parse(body);
  const currency = (parsed.currency ?? 'USD').toUpperCase();

  if (currency === 'USD') {
    const cents = Math.round(parsed.amount * 100);
    if (!Number.isFinite(cents) || cents < Math.round(MIN_TOP_UP_USD * 100)) {
      throw new Error(`Amount must be at least ${MIN_TOP_UP_USD} USD`);
    }
    if (Math.abs(parsed.amount * 100 - cents) > 1e-6) {
      throw new Error('Amount supports at most 2 decimal places');
    }
    return { ...parsed, currency: 'USD', amount: cents / 100 };
  }

  const minVnd = Math.max(1, Math.floor(minTopUpVnd));
  const amount = Math.round(parsed.amount);
  if (!Number.isInteger(parsed.amount) || amount < minVnd) {
    throw new Error(`Amount must be at least ${minVnd} VND`);
  }
  return { ...parsed, currency: 'VND', amount };
}

export const UpdateOrderStatusSchema = z.object({
  status: OrderStatusSchema,
  notes: z.string().optional(),
});

export const ApplyVoucherToOrderSchema = z.object({
  voucherCode: z.string().min(1, "Voucher code is required"),
});

export const CalculateOrderRequestSchema = z.object({
  amount: z.number().int().min(1),
  voucherCode: z.string().optional(),
  currency: z.string().default('VND'),
});

// Calculation Result Schemas (mới thêm)
export const PriceCalculationResultSchema = z.object({
  finalPrice: z.number().min(0),
  totalDiscount: z.number().min(0),
  appliedPolicies: z.array(z.object({
    policyId: z.number().int(),
    policyName: z.string(),
    discount: z.number(),
    type: z.string(),
  })).default([]),
});

export const VoucherCalculationResultSchema = z.object({
  finalAmount: z.number().min(0),
  discountAmount: z.number().min(0),
  voucher: z.any().optional(),
});

export const DiscountDetailSchema = z.object({
  policyDiscount: z
    .object({
      amount: z.number().min(0),
      type: z.literal('POLICY'),
      appliedPolicies: z.array(
        z.object({
          policyId: z.number().int(),
          policyName: z.string(),
          discount: z.number(),
          type: z.string(),
        }),
      ),
    })
    .optional(),
  voucherDiscount: z
    .object({
      amount: z.number().min(0),
      type: z.literal('VOUCHER'),
      voucher: z.any(),
    })
    .optional(),
});

export const OrderCalculationItemSchema = z.object({
  serviceId: z.number().int().min(0),
  basePrice: z.number().min(0),
  quantity: z.number().min(1),
  policy: PriceCalculationResultSchema,
  voucher: VoucherCalculationResultSchema,
  discounts: DiscountDetailSchema.optional(),
});

export const OrderCalculationResultSchema = z.object({
  items: z.array(OrderCalculationItemSchema),
});



// Types
export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderItemDiscount = z.infer<typeof OrderItemDiscountSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatus = z.infer<typeof UpdateOrderStatusSchema>;
export type ApplyVoucherToOrder = z.infer<typeof ApplyVoucherToOrderSchema>;
export type CalculateOrderRequest = z.infer<typeof CalculateOrderRequestSchema>;

export type PriceCalculationResult = z.infer<typeof PriceCalculationResultSchema>;
export type VoucherCalculationResult = z.infer<typeof VoucherCalculationResultSchema>;
export type DiscountDetail = z.infer<typeof DiscountDetailSchema>;
export type OrderCalculationItem = z.infer<typeof OrderCalculationItemSchema>;
export type OrderCalculationResult = z.infer<typeof OrderCalculationResultSchema>;

export interface OrderResponse {
  success: boolean;
  data: {
    id: string;
    orderCode: string;
    items: Array<{
      serviceId: string;
      quantity: number;
      basePrice: number;
      discounts: Array<any>;
    }>;
    summary: {
      subtotalAmount: number;
      discountAmount: number;
      finalAmount: number;
      currency: string;
    };
  };
  message: string;
}
export interface OrderDetail extends Order {
  items: OrderItem[];
  discounts: OrderItemDiscount[];
}

// Filter Types
export interface OrderFilters {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

// Domain Interfaces
export interface IOrderInfrastructureService {
  createOrder(user: any, request: CreateOrder): Promise<{ id: string; items: OrderCalculationItem[] }>;
  getOrders(filters: OrderFilters): Promise<OrderDetail[]>;
  getOrderDetail(orderId: number): Promise<OrderDetail>;
  updateOrderStatus(orderId: number, request: UpdateOrderStatus): Promise<Order>;
  cancelOrder(orderId: number): Promise<Order>;
}

// Service Interfaces cho external services
export interface IPriceApplicationService {
  calculatePrice(identifier: string, request: any): Promise<PriceCalculationResult>;
}

export interface IVoucherApplicationService {
  applyVoucher(identifier: string, request: any): Promise<VoucherCalculationResult>;
}

// Error Types
export const OrderErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

export type OrderError = z.infer<typeof OrderErrorSchema>;

export const ORDER_DEFAULT_LIMIT = 20;
export const ORDER_DEFAULT_PAGE = 1;
export const ORDER_CURRENCY = 'USD';

function timestampToIso(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Normalize UserDO row (created_at ms) to member API shape (createdAt ISO string). */
export function mapOrderForMemberApi(row: Record<string, unknown>): Record<string, unknown> {
  const payable = row.payableAmountVnd ?? row.payable_amount_vnd;
  const mapped: Record<string, unknown> = {
    id: row.id,
    orderCode: row.orderCode ?? row.order_code,
    subtotalAmount: row.subtotalAmount ?? row.subtotal_amount,
    discountAmount: row.discountAmount ?? row.discount_amount ?? 0,
    finalAmount: row.finalAmount ?? row.final_amount,
    status: row.status,
    currency: row.currency ?? ORDER_CURRENCY,
    appliedVoucherCode: row.appliedVoucherCode ?? row.applied_voucher_code ?? null,
    notes: row.notes ?? null,
    internalNotes: row.internalNotes ?? row.internal_notes ?? null,
    createdAt: timestampToIso(row.createdAt ?? row.created_at),
    updatedAt: timestampToIso(row.updatedAt ?? row.updated_at),
  };
  if (typeof payable === 'number' && payable > 0) {
    mapped.payableAmountVnd = Math.round(payable);
  }
  return mapped;
}

/** VND amount to charge at payment gateways (legacy orders without payableAmountVnd use finalAmount as VND). */
export function getOrderPayableVnd(
  order: { finalAmount: number; payableAmountVnd?: number | null; currency?: string | null },
  usdVndRate: number,
): number {
  const payable = order.payableAmountVnd;
  if (typeof payable === 'number' && payable > 0) return Math.round(payable);
  const cur = (order.currency ?? 'VND').toUpperCase();
  if (cur === 'USD') return convertUsdToVnd(order.finalAmount, usdVndRate);
  return Math.round(order.finalAmount);
}

// Helper Functions
export const validateOrderAmounts = (order: Order): boolean => {
  return order.finalAmount === order.subtotalAmount - order.discountAmount;
};

export const canCancelOrder = (status: OrderStatus): boolean => {
  return !['COMPLETED', 'CANCELLED'].includes(status);
};
