import { UserDO } from '../../ws/infrastructure/UserDO';
import { convertVndToUsd, roundWalletTopUpUsd, convertUsdToVnd } from '../../admin/service/pricing';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { createVoucherInfrastructureService } from '../../admin/voucher/infrastructure';
import { syncUserMembershipTierOnAccess } from '../../admin/membership-tier/infrastructure';
import type { MembershipTier } from '../../admin/membership-tier/domain';
import { processCommissionOnOrder } from '../referral/commission-service';
import {
  CreateOrder,
  UpdateOrderStatus,
  IOrderInfrastructureService,
  mapOrderForMemberApi,
} from './domain';
import { executeUtils } from '../../../shared/utils';

export function createOrderInfrastructureService(
  userDO: DurableObjectStub<UserDO>,
  context: any,
  bindingName: string,
): IOrderInfrastructureService {
  const generateOrderCode = (): string => {
    const timestamp = new Date().getTime().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `ORDER_${timestamp}${random}`;
  };

  const loadDbUser = async () => {
    const synced = await syncUserMembershipTierOnAccess(userDO, context.env);
    if (synced) return synced;
    const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    return rows[0];
  };

  return {
    async createOrder(user: any, request: CreateOrder): Promise<any> {
      const voucherInfra = createVoucherInfrastructureService(userDO);
      const dbUser = await loadDbUser();
      if (!dbUser?.id) {
        throw new Error('User profile not found');
      }

      const membershipTier = (dbUser.membershipTier ?? dbUser.membership_tier ?? 'member') as MembershipTier;
      const userId = Number(dbUser.id);
      const isUsdTopUp = (request.currency ?? 'USD').toUpperCase() === 'USD';
      const subtotal = request.amount;

      let appliedVoucherCode = request.voucherCode?.trim().toUpperCase() || undefined;
      let discountAmount = 0;

      if (!appliedVoucherCode) {
        const best = await voucherInfra.pickBestVoucher(userId, membershipTier, subtotal);
        if (best) appliedVoucherCode = best.code;
      }

      if (appliedVoucherCode) {
        const result = await voucherInfra.applyVoucher({
          voucherCode: appliedVoucherCode,
          basePrice: subtotal,
          orderAmount: subtotal,
          userId,
          membershipTier,
        });
        discountAmount = result.discountAmount;
      }

      const finalRaw = Math.max(0, subtotal - discountAmount);

      let subtotalAmount: number;
      let discountAmountStored: number;
      let finalAmount: number;
      let payableAmountVnd: number | undefined;

      if (isUsdTopUp) {
        subtotalAmount = roundWalletTopUpUsd(subtotal);
        discountAmountStored = roundWalletTopUpUsd(discountAmount);
        finalAmount = roundWalletTopUpUsd(finalRaw);
        const rate = await getUsdVndRateFromEnv(context.env, bindingName);
        payableAmountVnd = Math.round(convertUsdToVnd(finalAmount, rate));
      } else {
        const usdVndRate = await getUsdVndRateFromEnv(context.env, bindingName);
        subtotalAmount = convertVndToUsd(subtotal, usdVndRate);
        discountAmountStored = convertVndToUsd(discountAmount, usdVndRate);
        finalAmount = convertVndToUsd(finalRaw, usdVndRate);
        payableAmountVnd = Math.round(finalRaw);
      }

      const orderCode = generateOrderCode();
      const orderRecord = await executeUtils.executeDynamicAction(
        userDO,
        'insert',
        {
          orderCode,
          subtotalAmount,
          discountAmount: discountAmountStored,
          finalAmount,
          currency: 'USD',
          appliedVoucherCode,
          status: 'PENDING',
          notes: request.notes,
          payableAmountVnd,
        },
        'orders',
      );

      try {
        await processCommissionOnOrder(context, bindingName, user, {
          id: orderRecord.id,
          orderCode,
          finalAmount,
          currency: 'USD',
        });
      } catch (e) {
        console.warn('[Order] Commission processing failed:', e);
      }

      return {
        id: orderRecord.id,
        order: mapOrderForMemberApi(orderRecord as Record<string, unknown>),
        appliedVoucherCode,
        discountAmount: discountAmountStored,
      };
    },

    async getOrders(filters: any): Promise<any[]> {
      const queryParams: any = {
        orderBy: { field: 'created_at', direction: 'DESC' },
        limit: filters.limit,
        offset: (filters.page - 1) * filters.limit,
      };

      if (filters.status) {
        queryParams.where = { field: 'status', operator: '=', value: filters.status };
      }

      const orders = await executeUtils.executeDynamicAction(userDO, 'select', queryParams, 'orders');
      return orders.map((order: any) => mapOrderForMemberApi(order as Record<string, unknown>));
    },

    async getOrderDetail(orderId: number): Promise<any> {
      const order = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        { where: { field: 'id', operator: '=', value: orderId } },
        'orders',
      ).then((res: any) => res[0]);

      if (!order) {
        throw new Error('Order not found');
      }

      return mapOrderForMemberApi(order as Record<string, unknown>);
    },

    async updateOrderStatus(orderId: number, request: UpdateOrderStatus): Promise<any> {
      const base = request.notes
        ? { status: request.status, notes: request.notes }
        : { status: request.status };
      const shouldSyncToD1 = request.status === 'COMPLETED' || request.status === 'CANCELLED';
      const updateData = shouldSyncToD1 ? { ...base, queueStatus: 'pending' as const } : base;

      return executeUtils.executeDynamicAction(userDO, 'update', { id: orderId, ...updateData }, 'orders');
    },

    async cancelOrder(orderId: number): Promise<any> {
      return executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: orderId, status: 'CANCELLED', queueStatus: 'pending' as const },
        'orders',
      );
    },
  };
}
