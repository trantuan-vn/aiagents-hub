import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createVoucherInfrastructureService } from './infrastructure';
import { ApplyVoucher, ValidateVoucherRequest, Voucher } from './domain';

export interface IVoucherApplicationService {
  createVoucher(identifier: string, request: Voucher): Promise<Voucher>;
  applyVoucher(identifier: string, request: ApplyVoucher): Promise<any>;
  getVouchers(identifier: string, status?: string): Promise<Voucher[]>;
  getVoucherByCode(identifier: string, voucherCode: string): Promise<Voucher>;
  validateVoucher(identifier: string, request: ValidateVoucherRequest): Promise<any>;
  updateVoucherStatus(identifier: string, voucherId: number, status: string): Promise<Voucher>;
  getAvailableVouchers(identifier: string, userId: number, userRole?: string, basePrice?: number): Promise<Voucher[]>;
}

export function createVoucherApplicationService(c: Context, bindingName: string): IVoucherApplicationService {
  const getVoucherInfrastructure = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(`Durable Object not found for identifier: ${identifier}`);
    return createVoucherInfrastructureService(userDO);
  };

  return {
    async createVoucher(identifier: string, request: Voucher): Promise<any> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      const voucher = await voucherInfra.createVoucher(request);

      return {
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        type: voucher.type,
        discountValue: voucher.discountValue,
        minOrderAmount: voucher.minOrderAmount,
        maxDiscountAmount: voucher.maxDiscountAmount,
        usageLimit: voucher.usageLimit,
        usedCount: voucher.usedCount,
        applicableUsers: voucher.applicableUsers,
        userRoles: voucher.userRoles,
        expiresAt: voucher.expiresAt,
        status: voucher.status,
        createdAt: voucher.createdAt,
      };
    },

    async applyVoucher(identifier: string, request: ApplyVoucher): Promise<any> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      return await voucherInfra.applyVoucher(request);
    },

    async getVouchers(identifier: string, status?: string): Promise<any[]> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      const vouchers = await voucherInfra.getVouchers(status);

      return vouchers.map((voucher) => ({
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        type: voucher.type,
        discountValue: voucher.discountValue,
        usedCount: voucher.usedCount,
        usageLimit: voucher.usageLimit,
        status: voucher.status,
        expiresAt: voucher.expiresAt,
      }));
    },

    async getVoucherByCode(identifier: string, voucherCode: string): Promise<any> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      const voucher = await voucherInfra.getVoucherByCode(voucherCode);

      return {
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        type: voucher.type,
        discountValue: voucher.discountValue,
        minOrderAmount: voucher.minOrderAmount,
        maxDiscountAmount: voucher.maxDiscountAmount,
        usageLimit: voucher.usageLimit,
        usedCount: voucher.usedCount,
        applicableUsers: voucher.applicableUsers,
        userRoles: voucher.userRoles,
        expiresAt: voucher.expiresAt,
        status: voucher.status,
      };
    },

    async validateVoucher(identifier: string, request: ValidateVoucherRequest): Promise<any> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      return await voucherInfra.validateVoucher(request);
    },

    async updateVoucherStatus(identifier: string, voucherId: number, status: string): Promise<any> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      const voucher = await voucherInfra.updateVoucherStatus(voucherId, status);

      return {
        id: voucher.id,
        code: voucher.code,
        status: voucher.status,
        updatedAt: voucher.updatedAt,
      };
    },

    async getAvailableVouchers(identifier: string, userId: number, userRole?: string, basePrice?: number): Promise<any[]> {
      const voucherInfra = getVoucherInfrastructure(identifier);
      return await voucherInfra.getAvailableVouchers(userId, userRole, basePrice);
    },
  };
}
