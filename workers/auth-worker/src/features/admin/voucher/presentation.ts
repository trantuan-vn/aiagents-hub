import { Hono } from 'hono';
import { createVoucherApplicationService } from './application';
import { VoucherSchema, ApplyVoucherSchema, ValidateVoucherRequestSchema, VoucherStatusSchema } from './domain';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';

export function createVoucherRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: Function, errorMessage: string, requireAdmin: boolean = true) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        if (requireAdmin && user.role !== 'admin') {
          throw new Error('Insufficient permissions');
        }
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  app.post(
    '/vouchers',
    createRouteHandler(async (c: any, user: any) => {
      const body = await c.req.json();
      const request = VoucherSchema.parse(body);
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.createVoucher(user.identifier, request);
      return c.json(result);
    }, 'Failed to create voucher'),
  );

  app.post(
    '/apply',
    createRouteHandler(async (c: any, user: any) => {
      const body = await c.req.json();
      const request = ApplyVoucherSchema.parse(body);
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.applyVoucher(user.identifier, request);
      return c.json(result);
    }, 'Failed to apply voucher', false),
  );

  app.get(
    '/vouchers',
    createRouteHandler(async (c: any, user: any) => {
      const status = c.req.query('status') as 'ACTIVE' | 'INACTIVE' | undefined;
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.getVouchers(user.identifier, status);
      return c.json(result);
    }, 'Failed to get vouchers', false),
  );

  app.get(
    '/code/:voucherCode',
    createRouteHandler(async (c: any, user: any) => {
      const voucherCode = c.req.param('voucherCode');
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.getVoucherByCode(user.identifier, voucherCode);
      return c.json(result);
    }, 'Failed to get voucher', false),
  );

  app.post(
    '/validate',
    createRouteHandler(async (c: any, user: any) => {
      const body = await c.req.json();
      const request = ValidateVoucherRequestSchema.parse(body);
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.validateVoucher(user.identifier, request);
      return c.json(result);
    }, 'Failed to validate voucher', false),
  );

  app.patch(
    '/vouchers/:voucherId/status',
    createRouteHandler(async (c: any, user: any) => {
      const voucherIdParam = c.req.param('voucherId');
      if (!/^\d+$/.test(voucherIdParam)) {
        throw new Error('Invalid voucher ID format');
      }
      const voucherId = parseInt(voucherIdParam, 10);
      if (voucherId <= 0 || !Number.isInteger(voucherId)) {
        throw new Error('Invalid voucher ID');
      }

      const body = await c.req.json();
      const validatedStatus = VoucherStatusSchema.parse(body.status);
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const result = await voucherApp.updateVoucherStatus(user.identifier, voucherId, validatedStatus);
      return c.json(result);
    }, 'Failed to update voucher status'),
  );

  app.get(
    '/available',
    createRouteHandler(async (c: any, user: any) => {
      const basePrice = parseFloat(c.req.query('basePrice') || '0');
      const voucherApp = createVoucherApplicationService(c, bindingName);
      const userId = typeof user.id === 'number' ? user.id : parseInt(String(user.id), 10);
      if (!Number.isFinite(userId)) {
        throw new Error('User id is required for available vouchers');
      }
      const result = await voucherApp.getAvailableVouchers(user.identifier, userId, user.role, basePrice);
      return c.json(result);
    }, 'Failed to get available vouchers', false),
  );

  return app;
}
