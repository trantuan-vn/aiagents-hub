import { UserDO } from '../../ws/infrastructure/UserDO';
import { createPriceApplicationService } from '../../admin/policy/application';
import { convertVndToUsd } from '../../admin/service/pricing';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { createVoucherApplicationService } from '../../admin/voucher/application';
import { processCommissionOnOrder } from '../referral/commission-service';
import {
  CreateOrder,
  UpdateOrderStatus,
  IOrderInfrastructureService,
} from './domain';
import { executeUtils } from '../../../shared/utils';

const WALLET_LINE_SERVICE_ID = 0;

export function createOrderInfrastructureService(userDO: DurableObjectStub<UserDO>, context: any, bindingName: string): IOrderInfrastructureService {
  /** Wallet top-up: one line (serviceId 0) with user policies then optional voucher on the policy-adjusted amount. */
  const calculateWalletTopUp = async (user: any, request: CreateOrder): Promise<any[]> => {
    const priceApp = createPriceApplicationService(context, bindingName);
    const voucherApp = createVoucherApplicationService(context, bindingName);

    const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const dbUser = rows[0];
    if (!dbUser?.id) {
      throw new Error('User profile not found');
    }

    const amount = request.amount;
    const role = user.role ?? dbUser.role ?? 'member';
    const walletCalls = Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0;

    const priceData = {
      basePrice: amount,
      userId: dbUser.id,
      userRole: role,
      quantity: 1,
      currency: request.currency ?? 'VND',
      currentCalls: walletCalls,
      maxCalls: 0,
    };

    const policyResult = await priceApp.calculatePrice(user.identifier, priceData);
    const afterPolicy = policyResult.finalPrice;

    let voucherResult: { finalAmount: number; discountAmount: number; voucher: any } = {
      finalAmount: afterPolicy,
      discountAmount: 0,
      voucher: null,
    };

    if (request.voucherCode) {
      voucherResult = await voucherApp.applyVoucher(user.identifier, {
        voucherCode: request.voucherCode,
        basePrice: afterPolicy,
        orderAmount: amount,
        currentCalls: walletCalls,
        userId: dbUser.id,
        userRole: role,
      });
    }

    const discounts = buildDiscounts(amount, policyResult, voucherResult);

    return [
      {
        serviceId: WALLET_LINE_SERVICE_ID,
        basePrice: amount,
        quantity: 1,
        policy: {
          finalPrice: policyResult.finalPrice,
          totalDiscount: amount - policyResult.finalPrice,
          appliedPolicies: policyResult.appliedPolicies ?? [],
        },
        voucher: {
          finalAmount: voucherResult.finalAmount,
          discountAmount: voucherResult.discountAmount,
          voucher: voucherResult.voucher,
        },
        discounts: Object.keys(discounts).length > 0 ? discounts : undefined,
      },
    ];
  };

  const buildDiscounts = (baseAmount: number, policyResult: any, voucherResult: any) => {
    const discounts: Record<string, any> = {};
    const policyReduction = baseAmount - policyResult.finalPrice;

    if (policyReduction > 0) {
      discounts.policyDiscount = {
        amount: policyReduction,
        type: 'POLICY',
        appliedPolicies: policyResult.appliedPolicies ?? [],
      };
    }

    if (voucherResult.discountAmount > 0 && voucherResult.voucher) {
      const code =
        typeof voucherResult.voucher === 'object' && voucherResult.voucher.code != null
          ? voucherResult.voucher.code
          : String(voucherResult.voucher);
      discounts.voucherDiscount = {
        amount: voucherResult.discountAmount,
        type: 'VOUCHER',
        voucher: code,
      };
    }

    return discounts;
  };

  const generateOrderCode = (): string => {
    const timestamp = new Date().getTime().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `ORDER_${timestamp}${random}`;
  };

  const createOrderDiscounts = async (orderItemId: string, discounts: any): Promise<void> => {
    const discountRecords = [];

    if (discounts?.policyDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(
          userDO,
          'insert',
          {
            orderItemId,
            discountType: discounts.policyDiscount.type,
            discountAmount: discounts.policyDiscount.amount,
            appliedPolicies: discounts.policyDiscount.appliedPolicies,
          },
          'order_discounts',
        ),
      );
    }

    if (discounts?.voucherDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(
          userDO,
          'insert',
          {
            orderItemId,
            discountType: discounts.voucherDiscount.type,
            discountAmount: discounts.voucherDiscount.amount,
            appliedVoucherCode: discounts.voucherDiscount.voucher,
          },
          'order_discounts',
        ),
      );
    }

    await Promise.all(discountRecords);
  };

  return {
    async createOrder(user: any, request: CreateOrder): Promise<any> {
      const calculationResult = await calculateWalletTopUp(user, request);

      const subtotalVnd = calculationResult.reduce((total, item) => total + item.basePrice * item.quantity, 0);
      const discountVnd = calculationResult.reduce(
        (total, item) => total + (item.policy.totalDiscount + item.voucher.discountAmount) * item.quantity,
        0,
      );
      const finalAmountVnd = Math.max(0, subtotalVnd - discountVnd);
      const payableAmountVnd = Math.round(finalAmountVnd);

      const usdVndRate = await getUsdVndRateFromEnv(context.env, bindingName);
      const toUsd = (vnd: number): number => convertVndToUsd(vnd, usdVndRate);

      const subtotalAmount = toUsd(subtotalVnd);
      const discountAmount = toUsd(discountVnd);
      const finalAmount = toUsd(finalAmountVnd);

      const orderData = {
        orderCode: generateOrderCode(),
        subtotalAmount,
        discountAmount,
        finalAmount,
        payableAmountVnd,
        currency: 'USD',
        appliedVoucherCode: request.voucherCode,
        status: 'PENDING',
        notes: request.notes,
      };

      const orderRecord = await executeUtils.executeDynamicAction(userDO, 'insert', orderData, 'orders');

      // Tạo order items và discounts
      for (const item of calculationResult) {
        const itemDiscountVnd = item.policy.totalDiscount + item.voucher.discountAmount;
        const itemFinalVnd = item.basePrice - itemDiscountVnd;
        const orderItem = await executeUtils.executeDynamicAction(userDO, 'insert', {
          serviceId: item.serviceId,
          basePrice: toUsd(item.basePrice),
          quantity: item.quantity,
          finalAmount: toUsd(itemFinalVnd),
          discountAmount: toUsd(itemDiscountVnd),
          orderId: orderRecord.id
        }, 'order_items');

        if (item.discounts) {
          const discountsUsd: Record<string, { amount: number; type: string; appliedPolicies?: unknown; voucher?: string }> = {};
          if (item.discounts.policyDiscount) {
            discountsUsd.policyDiscount = {
              ...item.discounts.policyDiscount,
              amount: toUsd(item.discounts.policyDiscount.amount),
            };
          }
          if (item.discounts.voucherDiscount) {
            discountsUsd.voucherDiscount = {
              ...item.discounts.voucherDiscount,
              amount: toUsd(item.discounts.voucherDiscount.amount),
            };
          }
          await createOrderDiscounts(orderItem.id, discountsUsd);
        }
      }

      // Process commission for referrer if user has one
      try {
        await processCommissionOnOrder(context, bindingName, user, {
          id: orderRecord.id,
          orderCode: orderData.orderCode,
          finalAmount,
          currency: 'USD',
        });
      } catch (e) {
        console.warn('[Order] Commission processing failed:', e);
      }

      return { id: orderRecord.id, items: calculationResult };
    },

    async getOrders(filters: any): Promise<any[]> {
      const queryParams: any = {
        orderBy: { field: 'created_at', direction: 'DESC' },
        limit: filters.limit,
        offset: (filters.page - 1) * filters.limit
      };

      if (filters.status) {
        queryParams.where = { field: "status", operator: '=', value: filters.status };
      }

      const orders = await executeUtils.executeDynamicAction(userDO, 'select', queryParams, 'orders')      

      const ordersWithItems = await Promise.all(
        orders.map(async (order: any) => {
          const items = await executeUtils.executeDynamicAction(userDO, 'select', {
            where: { field: "order_id", operator: '=', value: order.id }
          }, 'order_items') 
          return { ...order, items };
        })
      );

      return ordersWithItems;
    },

    async getOrderDetail(orderId: number): Promise<any> {
      const order = await executeUtils.executeDynamicAction(userDO, 'select', {
            where: { field: "id", operator: '=', value: orderId }
          }, 'orders').then((res: any) => res[0]);

      if (!order) {
        throw new Error('Order not found');
      }

      const [items, discounts] = await Promise.all([
        executeUtils.executeRepositorySelect(userDO, 'select * from order_items where order_id = ?', [orderId], "order_items"),
        executeUtils.executeRepositorySelect(userDO,
          `select od.* from order_discounts od 
           join order_items oi on od.order_item_id = oi.id 
           where oi.order_id = ?`,
          [orderId], "order_discounts"
        )
      ]);

      return { ...order, items, discounts };
    },

    async updateOrderStatus(orderId: number, request: UpdateOrderStatus): Promise<any> {
      const base = request.notes
        ? { status: request.status, notes: request.notes }
        : { status: request.status };
      const shouldSyncToD1 = request.status === 'COMPLETED' || request.status === 'CANCELLED';
      const updateData = shouldSyncToD1 ? { ...base, queueStatus: 'pending' as const } : base;

      return await executeUtils.executeDynamicAction(userDO, 'update', { id: orderId, ...updateData }, 'orders');
    },

    async cancelOrder(orderId: number): Promise<any> {
      const updateData = { status: 'CANCELLED', queueStatus: 'pending' as const };
      return await executeUtils.executeDynamicAction(userDO, 'update', { id: orderId, ...updateData }, 'orders');
    }
  };
}