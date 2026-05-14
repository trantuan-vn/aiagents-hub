import { UserDO } from '../../ws/infrastructure/UserDO';
import { ApplyVoucher, ValidateVoucherRequest, IVoucherInfrastructureService, Voucher } from './domain';
import { executeUtils } from '../../../shared/utils';

export function createVoucherInfrastructureService(userDO: DurableObjectStub<UserDO>): IVoucherInfrastructureService {
  const assertVoucherApplicable = (voucher: any, request: { orderAmount: number; currentCalls?: number; userId: number; userRole?: string }) => {
    if (voucher.status !== 'ACTIVE') {
      throw new Error(`Voucher for ${voucher.code} is not active.`);
    }

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      throw new Error(`Voucher for ${voucher.code} has expired.`);
    }

    if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
      throw new Error(`Voucher for ${voucher.code} has reached its usage limit.`);
    }

    if (voucher.minOrderAmount && request.orderAmount < voucher.minOrderAmount) {
      throw new Error(`Voucher for ${voucher.code} requires a minimum order amount of ${voucher.minOrderAmount}.`);
    }

    const uid = request.userId;
    if (voucher.applicableUsers?.length && !voucher.applicableUsers.includes(uid)) {
      throw new Error(`Voucher for ${voucher.code} is not applicable for user ${uid}.`);
    }

    if (voucher.userRoles?.length && request.userRole && !voucher.userRoles.includes(request.userRole)) {
      throw new Error(`Voucher for ${voucher.code} is not applicable for user role ${request.userRole}.`);
    }

    if (voucher.conditions && voucher.type === 'USAGE_BASED') {
      const { minUsage, maxCalls } = voucher.conditions;
      const currentCalls = request.currentCalls || 0;

      if (minUsage !== undefined && currentCalls < minUsage) {
        throw new Error(`Voucher for ${voucher.code} requires a minimum usage of ${minUsage}. Current usage is ${currentCalls}.`);
      }

      if (maxCalls !== undefined && currentCalls > maxCalls) {
        throw new Error(`Voucher for ${voucher.code} requires a maximum usage of ${maxCalls}. Current usage is ${currentCalls}.`);
      }
    }
  };

  const calculateDiscount = (voucher: any, basePrice: number, currentCalls: number): number => {
    let discount = 0;

    switch (voucher.type) {
      case 'PERCENTAGE':
        discount = basePrice * (voucher.discountValue / 100);
        if (voucher.maxDiscountAmount && discount > voucher.maxDiscountAmount) {
          discount = voucher.maxDiscountAmount;
        }
        break;

      case 'FIXED_AMOUNT':
        discount = voucher.discountValue;
        break;

      case 'USAGE_BASED':
        discount = calculateUsageBasedDiscount(voucher, basePrice, currentCalls);
        break;

      case 'TIERED':
        discount = calculateTieredDiscount(voucher, basePrice);
        break;
    }

    return Math.min(discount, basePrice);
  };

  const calculateUsageBasedDiscount = (voucher: any, basePrice: number, currentCalls: number): number => {
    if (voucher.conditions?.minUsage != null && voucher.conditions?.maxCalls != null) {
      const { minUsage, maxCalls } = voucher.conditions;

      if (currentCalls >= minUsage && currentCalls <= maxCalls) {
        const usageRange = maxCalls - minUsage;
        const currentPosition = currentCalls - minUsage;
        const discountMultiplier = usageRange > 0 ? currentPosition / usageRange : 0;

        return (basePrice * (voucher.discountValue * discountMultiplier)) / 100;
      }
    }

    return voucher.discountValue;
  };

  const calculateTieredDiscount = (voucher: any, basePrice: number): number => {
    const tiers = [...(voucher.conditions?.tiers || [])].sort((a, b) => a.minAmount - b.minAmount);
    let best = 0;
    for (const tier of tiers) {
      if (basePrice >= tier.minAmount) {
        best = tier.type === 'PERCENTAGE' ? basePrice * (tier.value / 100) : tier.value;
      }
    }
    return best;
  };

  return {
    async createVoucher(request: Partial<Voucher>): Promise<any> {
      const existingVouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: request.code },
            { field: 'status', operator: '=', value: 'ACTIVE' },
          ],
        },
        'vouchers',
      );

      if (existingVouchers.length > 0) {
        throw new Error('Voucher code already exists');
      }
      return await executeUtils.executeDynamicAction(userDO, 'insert', request, 'vouchers');
    },

    async applyVoucher(request: ApplyVoucher): Promise<any> {
      const { voucherCode, basePrice, userId } = request;

      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: voucherCode.toUpperCase() },
            { field: 'status', operator: '=', value: 'ACTIVE' },
          ],
        },
        'vouchers',
      );

      if (vouchers.length === 0) {
        throw new Error('Voucher not found');
      }

      const voucher = vouchers[0];

      assertVoucherApplicable(voucher, request);

      const discountAmount = calculateDiscount(voucher, basePrice, request.currentCalls || 0);

      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        {
          id: voucher.id,
          data: { usedCount: voucher.usedCount + 1 },
        },
        'vouchers',
      );

      return {
        voucher: {
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          type: voucher.type,
        },
        userId,
        originalAmount: basePrice,
        discountAmount,
        finalAmount: basePrice - discountAmount,
      };
    },

    async getVouchers(status?: string): Promise<any[]> {
      const query: any = {
        orderBy: { field: 'createdAt', direction: 'DESC' },
      };

      if (status !== undefined) {
        query.where = { field: 'status', operator: '=', value: status };
      }

      return await executeUtils.executeDynamicAction(userDO, 'select', query, 'vouchers');
    },

    async getVoucherByCode(voucherCode: string): Promise<any> {
      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: voucherCode.toUpperCase() },
            { field: 'status', operator: '=', value: 'ACTIVE' },
          ],
        },
        'vouchers',
      );

      if (vouchers.length === 0) {
        throw new Error('Voucher not found');
      }

      return vouchers[0];
    },

    async validateVoucher(request: ValidateVoucherRequest): Promise<any> {
      const { voucherCode } = request;
      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: voucherCode.toUpperCase() },
            { field: 'status', operator: '=', value: 'ACTIVE' },
          ],
        },
        'vouchers',
      );

      if (vouchers.length === 0) {
        return { isValid: false, errorMessage: 'Voucher not found' };
      }

      const voucher = vouchers[0];

      try {
        assertVoucherApplicable(voucher, request);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Voucher is not applicable';
        return { isValid: false, errorMessage: message };
      }

      return {
        isValid: true,
        voucher: {
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          type: voucher.type,
          discountValue: voucher.discountValue,
          maxDiscountAmount: voucher.maxDiscountAmount,
        },
      };
    },

    async updateVoucherStatus(voucherId: number, status: string): Promise<any> {
      return await executeUtils.executeDynamicAction(
        userDO,
        'update',
        {
          id: voucherId,
          status: status,
        },
        'vouchers',
      );
    },

    async getAvailableVouchers(userId: number, userRole?: string, basePrice?: number): Promise<any[]> {
      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [{ field: 'status', operator: '=', value: 'ACTIVE' }],
        },
        'vouchers',
      );

      const now = new Date();

      return vouchers.filter((voucher: any) => {
        if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
          return false;
        }
        if (voucher.expiresAt && new Date(voucher.expiresAt) < now) {
          return false;
        }
        if (voucher.applicableUsers?.length && !voucher.applicableUsers.includes(userId)) {
          return false;
        }
        if (voucher.userRoles?.length && userRole && !voucher.userRoles.includes(userRole)) {
          return false;
        }
        if (basePrice !== undefined && voucher.minOrderAmount && basePrice < voucher.minOrderAmount) {
          return false;
        }
        return true;
      });
    },
  };
}
