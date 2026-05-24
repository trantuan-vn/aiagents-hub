import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  ApplyVoucher,
  ValidateVoucherRequest,
  IVoucherInfrastructureService,
  Voucher,
  calculateVoucherDiscount,
} from './domain';
import { executeUtils } from '../../../shared/utils';

function assertTierMatch(voucher: Record<string, unknown>, membershipTier?: string): void {
  const applicableTo = voucher.applicableTo ?? voucher.applicable_to ?? 'ALL';
  if (applicableTo !== 'GROUPS') return;
  const tiers = (voucher.membershipTiers ?? voucher.membership_tiers ?? []) as string[];
  const userTier = membershipTier ?? 'member';
  if (tiers.length > 0 && !tiers.includes(userTier)) {
    throw new Error(`Voucher for ${voucher.code} is not applicable for tier ${userTier}.`);
  }
}

export function createVoucherInfrastructureService(userDO: DurableObjectStub<UserDO>): IVoucherInfrastructureService {
  const assertVoucherApplicable = (voucher: Record<string, unknown>, request: ApplyVoucher | ValidateVoucherRequest) => {
    if (voucher.status !== 'ACTIVE') {
      throw new Error(`Voucher for ${voucher.code} is not active.`);
    }

    if (voucher.expiresAt && new Date(String(voucher.expiresAt)) < new Date()) {
      throw new Error(`Voucher for ${voucher.code} has expired.`);
    }

    const usedCount = Number(voucher.usedCount ?? 0);
    const usageLimit = voucher.usageLimit as number | undefined;
    if (usageLimit && usedCount >= usageLimit) {
      throw new Error(`Voucher for ${voucher.code} has reached its usage limit.`);
    }

    const minOrder = voucher.minOrderAmount as number | undefined;
    if (minOrder && request.orderAmount < minOrder) {
      throw new Error(`Voucher for ${voucher.code} requires a minimum order amount of ${minOrder}.`);
    }

    assertTierMatch(voucher, request.membershipTier);
  };

  const listActive = async (): Promise<any[]> => {
    return executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: [{ field: 'status', operator: '=', value: 'ACTIVE' }] },
      'vouchers',
    );
  };

  const filterAvailable = (vouchers: any[], membershipTier?: string, basePrice?: number) => {
    const now = new Date();
    return vouchers.filter((voucher) => {
      const usedCount = Number(voucher.usedCount ?? 0);
      if (voucher.usageLimit && usedCount >= voucher.usageLimit) return false;
      if (voucher.expiresAt && new Date(voucher.expiresAt) < now) return false;
      if (basePrice !== undefined && voucher.minOrderAmount && basePrice < voucher.minOrderAmount) return false;
      try {
        assertTierMatch(voucher, membershipTier);
      } catch {
        return false;
      }
      return true;
    });
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
      return executeUtils.executeDynamicAction(userDO, 'insert', request, 'vouchers');
    },

    async applyVoucher(request: ApplyVoucher): Promise<any> {
      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: request.voucherCode.toUpperCase() },
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

      const discountAmount = calculateVoucherDiscount(voucher, request.basePrice);

      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: voucher.id, data: { usedCount: Number(voucher.usedCount ?? 0) + 1 } },
        'vouchers',
      );

      return {
        voucher: {
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          discountPercent: voucher.discountPercent ?? voucher.discountValue,
        },
        userId: request.userId,
        originalAmount: request.basePrice,
        discountAmount,
        finalAmount: request.basePrice - discountAmount,
      };
    },

    async getVouchers(status?: string): Promise<any[]> {
      const query: Record<string, unknown> = {
        orderBy: { field: 'createdAt', direction: 'DESC' },
      };
      if (status !== undefined) {
        query.where = { field: 'status', operator: '=', value: status };
      }
      return executeUtils.executeDynamicAction(userDO, 'select', query, 'vouchers');
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
      const vouchers = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'code', operator: '=', value: request.voucherCode.toUpperCase() },
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

      const discountAmount = calculateVoucherDiscount(voucher, request.basePrice);

      return {
        isValid: true,
        discountAmount,
        voucher: {
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          discountPercent: voucher.discountPercent ?? voucher.discountValue,
          maxDiscountAmount: voucher.maxDiscountAmount,
        },
      };
    },

    async updateVoucherStatus(voucherId: number, status: string): Promise<any> {
      return executeUtils.executeDynamicAction(userDO, 'update', { id: voucherId, status }, 'vouchers');
    },

    async getAvailableVouchers(userId: number, membershipTier?: string, basePrice?: number): Promise<any[]> {
      void userId;
      const vouchers = await listActive();
      const available = filterAvailable(vouchers, membershipTier, basePrice);
      if (basePrice === undefined) return available;

      return available
        .map((voucher) => ({
          ...voucher,
          estimatedDiscount: calculateVoucherDiscount(voucher, basePrice),
        }))
        .sort((a, b) => b.estimatedDiscount - a.estimatedDiscount);
    },

    async pickBestVoucher(
      userId: number,
      membershipTier: string | undefined,
      basePrice: number,
    ): Promise<{ code: string; discountAmount: number; voucher: any } | null> {
      const list = await this.getAvailableVouchers(userId, membershipTier, basePrice);
      if (list.length === 0) return null;
      const best = list[0];
      const discountAmount = calculateVoucherDiscount(best, basePrice);
      return { code: best.code, discountAmount, voucher: best };
    },
  };
}
