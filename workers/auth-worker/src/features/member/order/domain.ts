import { z } from 'zod';

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
  subtotalAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalAmount: z.number().min(0),
  status: OrderStatusSchema,
  currency: z.string().default('VND'),
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

/** Wallet top-up: amount is VND credited after payment (policies / vouchers apply to payable amount). */
export const CreateOrderSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().default('VND'),
  voucherCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
});

/** Validates create-order JSON; `minTopUpVnd` from system config `billing.MIN_TOP_UP_VND`. */
export function parseCreateOrderRequest(body: unknown, minTopUpVnd: number): CreateOrder {
  return CreateOrderSchema.extend({
    amount: z.number().int().min(minTopUpVnd, `Amount must be at least ${minTopUpVnd} VND`),
  }).parse(body);
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
export const ORDER_CURRENCY = 'VND';

// Helper Functions
export const validateOrderAmounts = (order: Order): boolean => {
  return order.finalAmount === order.subtotalAmount - order.discountAmount;
};

export const canCancelOrder = (status: OrderStatus): boolean => {
  return !['COMPLETED', 'CANCELLED'].includes(status);
};
