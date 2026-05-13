import { UserDO } from '../../ws/infrastructure/UserDO';
import { createPriceApplicationService } from '../../admin/policy/application';
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
  /** Top-up order: one synthetic line (serviceId 0) with policies + vouchers applied to `amount`. */
  const calculateWalletTopUp = async (user: any, request: CreateOrder): Promise<any[]> => {
    const priceApp = createPriceApplicationService(context, bindingName);
    const voucherApp = createVoucherApplicationService(context, bindingName);

    const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const dbUser = rows[0];
    if (!dbUser?.id) {
      throw new Error('User profile not found');
    }

    const amount = request.amount;
    const orderAmount = amount;

    const priceData = {
      basePrice: amount,
      userId: dbUser.id,
      userRole: user.role ?? dbUser.role ?? 'member',
      serviceId: WALLET_LINE_SERVICE_ID,
      serviceName: 'Wallet top-up',
      quantity: 1,
      currency: request.currency ?? 'VND',
      currentCalls: Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0,
      maxCalls: 0,
    };

    const pricePromises = [
      priceApp.calculateServicePrice(user.identifier, priceData),
      priceApp.calculateUserPrice(user.identifier, priceData),
    ];

    const voucherPromises = request.voucherCode
      ? [
          voucherApp.applyServiceVoucher(user.identifier, {
            voucherCode: request.voucherCode,
            basePrice: amount,
            orderAmount,
            serviceId: WALLET_LINE_SERVICE_ID,
            currentCalls: priceData.currentCalls,
            userId: dbUser.id,
            userRole: user.role ?? dbUser.role ?? 'member',
          }),
          voucherApp.applyUserVoucher(user.identifier, {
            voucherCode: request.voucherCode,
            basePrice: amount,
            orderAmount,
            serviceId: WALLET_LINE_SERVICE_ID,
            currentCalls: priceData.currentCalls,
            userId: dbUser.id,
            userRole: user.role ?? dbUser.role ?? 'member',
          }),
        ]
      : [
          Promise.resolve({ finalAmount: amount, discountAmount: 0, voucher: null }),
          Promise.resolve({ finalAmount: amount, discountAmount: 0, voucher: null }),
        ];

    const [servicePriceResult, userPriceResult, serviceVoucherResult, userVoucherResult] = await Promise.all([
      ...pricePromises,
      ...voucherPromises,
    ]);

    const discounts = createDiscountsObject(servicePriceResult, userPriceResult, serviceVoucherResult, userVoucherResult);

    return [
      {
        serviceId: WALLET_LINE_SERVICE_ID,
        basePrice: amount,
        quantity: 1,
        servicePrice: {
          finalPrice: servicePriceResult.finalPrice,
          totalDiscount: servicePriceResult.totalDiscount,
        },
        userPrice: {
          finalPrice: userPriceResult.finalPrice,
          totalDiscount: userPriceResult.totalDiscount,
        },
        serviceVoucher: {
          finalAmount: serviceVoucherResult.finalAmount,
          discountAmount: serviceVoucherResult.discountAmount,
        },
        userVoucher: {
          finalAmount: userVoucherResult.finalAmount,
          discountAmount: userVoucherResult.discountAmount,
        },
        discounts: Object.keys(discounts).length > 0 ? discounts : undefined,
      },
    ];
  };

  const createDiscountsObject = (servicePrice: any, userPrice: any, serviceVoucher: any, userVoucher: any) => {
    const discounts: any = {};
    
    if (servicePrice.totalDiscount > 0) {
      discounts.servicePriceDiscount = {
        amount: servicePrice.totalDiscount,
        type: 'SERVICE_PRICE',
        appliedPolicies: servicePrice.appliedPolicies
      };
    }
    
    if (userPrice.totalDiscount > 0) {
      discounts.userPriceDiscount = {
        amount: userPrice.totalDiscount,
        type: 'USER_PRICE',
        appliedPolicies: userPrice.appliedPolicies
      };
    }
    
    if (serviceVoucher.discountAmount > 0 && serviceVoucher.voucher) {
      const code = typeof serviceVoucher.voucher === 'object' && serviceVoucher.voucher.code != null
        ? serviceVoucher.voucher.code
        : String(serviceVoucher.voucher);
      discounts.serviceVoucherDiscount = {
        amount: serviceVoucher.discountAmount,
        type: 'SERVICE_VOUCHER',
        voucher: code
      };
    }

    if (userVoucher.discountAmount > 0 && userVoucher.voucher) {
      const code = typeof userVoucher.voucher === 'object' && userVoucher.voucher.code != null
        ? userVoucher.voucher.code
        : String(userVoucher.voucher);
      discounts.userVoucherDiscount = {
        amount: userVoucher.discountAmount,
        type: 'USER_VOUCHER',
        voucher: code
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
    
    if (discounts?.servicePriceDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(userDO, 'insert', {
          orderItemId,
          discountType: discounts.servicePriceDiscount.type,
          discountAmount: discounts.servicePriceDiscount.amount,
          appliedPolicies: discounts.servicePriceDiscount.appliedPolicies
        }, 'order_discounts')
      );
    }

    if (discounts?.userPriceDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(userDO, 'insert', {
          orderItemId,
          discountType: discounts.userPriceDiscount.type,
          discountAmount: discounts.userPriceDiscount.amount,
          appliedPolicies: discounts.userPriceDiscount.appliedPolicies
        }, 'order_discounts')
      );
    }

    if (discounts?.serviceVoucherDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(userDO, 'insert', {
          orderItemId,
          discountType: discounts.serviceVoucherDiscount.type,
          discountAmount: discounts.serviceVoucherDiscount.amount,
          appliedVoucherCode: discounts.serviceVoucherDiscount.voucher
        }, 'order_discounts')
      );
    }

    if (discounts?.userVoucherDiscount) {
      discountRecords.push(
        executeUtils.executeDynamicAction(userDO, 'insert', {
          orderItemId,
          discountType: discounts.userVoucherDiscount.type,
          discountAmount: discounts.userVoucherDiscount.amount,
          appliedVoucherCode: discounts.userVoucherDiscount.voucher
        }, 'order_discounts')
      );
    }

    await Promise.all(discountRecords);
  };

  return {
    async createOrder(user: any, request: CreateOrder): Promise<any> {
      const calculationResult = await calculateWalletTopUp(user, request);

      const subtotalAmount = calculationResult.reduce((total, item) => total + item.basePrice * item.quantity, 0);
      const discountAmount = calculationResult.reduce((total, item) => 
        total + (item.servicePrice.totalDiscount + item.userPrice.totalDiscount + 
               item.serviceVoucher.discountAmount + item.userVoucher.discountAmount)* item.quantity, 0);
      const finalAmount = Math.max(0, subtotalAmount - discountAmount);

      const orderData = {
        orderCode: generateOrderCode(),
        subtotalAmount,
        discountAmount,
        finalAmount,
        currency: request.currency,
        appliedVoucherCode: request.voucherCode,
        status: 'PENDING',
        notes: request.notes,
      };

      const orderRecord = await executeUtils.executeDynamicAction(userDO, 'insert', orderData, 'orders');

      // Tạo order items và discounts
      for (const item of calculationResult) {
        const orderItem = await executeUtils.executeDynamicAction(userDO, 'insert', {
          serviceId: item.serviceId,
          basePrice: item.basePrice,
          quantity: item.quantity,
          finalAmount: item.basePrice - (item.servicePrice.totalDiscount + item.userPrice.totalDiscount + 
                     item.serviceVoucher.discountAmount + item.userVoucher.discountAmount),
          discountAmount: item.servicePrice.totalDiscount + item.userPrice.totalDiscount + 
                         item.serviceVoucher.discountAmount + item.userVoucher.discountAmount,
          orderId: orderRecord.id
        }, 'order_items');

        if (item.discounts) {
          await createOrderDiscounts(orderItem.id, item.discounts);
        }
      }

      // Process commission for referrer if user has one
      try {
        await processCommissionOnOrder(context, bindingName, user, {
          id: orderRecord.id,
          orderCode: orderData.orderCode,
          finalAmount,
          currency: request.currency ?? 'VND',
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
      const updateData = request.notes 
        ? { status: request.status, notes: request.notes }
        : { status: request.status };

      return await executeUtils.executeDynamicAction(userDO, 'update', { id: orderId, ...updateData }, 'orders');
    },

    async cancelOrder(orderId: number): Promise<any> {
      const updateData = { status: 'CANCELLED' };
      return await executeUtils.executeDynamicAction(userDO, 'update', { id: orderId, ...updateData }, 'orders');
    }
  };
}