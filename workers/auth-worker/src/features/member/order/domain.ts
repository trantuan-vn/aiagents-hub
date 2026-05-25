import { z } from 'zod';

import { convertUsdToVnd } from '../../admin/service/pricing';

export const OrderStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']);

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

/** Wallet top-up request (USD or legacy VND). */
export const CreateOrderSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  voucherCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
});

const MIN_TOP_UP_USD = 1;

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

export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatus = z.infer<typeof UpdateOrderStatusSchema>;

export interface OrderDetail extends Order {
  id?: number | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

export interface IOrderInfrastructureService {
  createOrder(user: any, request: CreateOrder): Promise<{ id: string; order: OrderDetail }>;
  getOrders(filters: OrderFilters): Promise<OrderDetail[]>;
  getOrderDetail(orderId: number): Promise<OrderDetail>;
  updateOrderStatus(orderId: number, request: UpdateOrderStatus): Promise<Order>;
  cancelOrder(orderId: number): Promise<Order>;
}

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

export function getOrderWalletCreditUsd(order: {
  subtotalAmount?: number;
  subtotal_amount?: number;
  finalAmount?: number;
  final_amount?: number;
}): number {
  const sub = order.subtotalAmount ?? order.subtotal_amount;
  if (typeof sub === 'number' && sub > 0) return sub;
  return Number(order.finalAmount ?? order.final_amount ?? 0) || 0;
}

export function getOrderWalletCreditVnd(
  order: Parameters<typeof getOrderWalletCreditUsd>[0] & { currency?: string | null },
  usdVndRate: number,
): number {
  const creditUsd = getOrderWalletCreditUsd(order);
  const cur = (order.currency ?? 'USD').toUpperCase();
  if (cur === 'USD') return Math.round(convertUsdToVnd(creditUsd, usdVndRate));
  return Math.round(creditUsd);
}

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

export const validateOrderAmounts = (order: Order): boolean => {
  return order.finalAmount === order.subtotalAmount - order.discountAmount;
};

export const canCancelOrder = (status: OrderStatus): boolean => {
  return !['COMPLETED', 'CANCELLED'].includes(status);
};

