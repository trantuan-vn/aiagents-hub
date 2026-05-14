import { Hono } from 'hono';
import { createPriceApplicationService } from './application';
import { PricePolicySchema, PolicyIdSchema, StatusSchema, PriceCalculationRequestSchema, PricePolicy } from './domain';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';

const assertSpecificPolicyHasUserIds = (data: PricePolicy) => {
  if (data.applicableTo === 'SPECIFIC' && (!data.targetIds || data.targetIds.length === 0)) {
    throw new Error('SPECIFIC policies require at least one user id in targetIds');
  }
};

export function createPriceRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // Helper function để xử lý route chung
  const createRouteHandler = (
    handler: Function, 
    errorMessage: string, 
    requireAdmin: boolean = true
  ) => {
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

  // Tạo chính sách giá mới
  app.post('/new', createRouteHandler(async (c: any, user: any) => {
    const body = await c.req.json();
    const request = PricePolicySchema.parse(body);
    assertSpecificPolicyHasUserIds(request);
    const priceApp = createPriceApplicationService(c, bindingName);
    const result = await priceApp.createPricePolicy(user.identifier, request);
    return c.json(result);
  }, 'Failed to create price policy'));

  // Cập nhật chính sách giá
  app.put('/:policyId', createRouteHandler(async (c: any, user: any) => {
    const policyIdParam = c.req.param('policyId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(policyIdParam)) {
      throw new Error('Invalid policy ID format');
    }
    const policyId = parseInt(policyIdParam, 10);
    // Validate range (positive integer)
    if (policyId <= 0 || !Number.isInteger(policyId)) {
      throw new Error('Invalid policy ID');
    }

    const body = await c.req.json();
    const request = PricePolicySchema.parse(body);
    assertSpecificPolicyHasUserIds(request);
    const priceApp = createPriceApplicationService(c, bindingName);
    const result = await priceApp.updatePricePolicy(user.identifier, policyId, request);
    return c.json(result);
  }, 'Failed to update price policy'));

  // Lấy danh sách chính sách giá
  app.get('/get', createRouteHandler(async (c: any, user: any) => {
    const status = c.req.query('status') as 'ACTIVE' | 'INACTIVE' | undefined;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const priceApp = createPriceApplicationService(c, bindingName);
    const result = await priceApp.getPricePolicies(user.identifier, limit, offset, status);
    return c.json(result);
  }, 'Failed to get price policies'));

  // Lấy chi tiết chính sách giá
  app.get('/:policyId', createRouteHandler(async (c: any, user: any) => {
    const policyIdParam = c.req.param('policyId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(policyIdParam)) {
      throw new Error('Invalid policy ID format');
    }
    const policyId = parseInt(policyIdParam, 10);
    // Validate range (positive integer)
    if (policyId <= 0 || !Number.isInteger(policyId)) {
      throw new Error('Invalid policy ID');
    }
    const priceApp = createPriceApplicationService(c, bindingName);
    const result = await priceApp.getPricePolicy(user.identifier, policyId);
    return c.json(result);
  }, 'Failed to get price policy'));

  // Xóa chính sách giá
  app.delete('/:policyId', createRouteHandler(async (c: any, user: any) => {
    const policyIdParam = c.req.param('policyId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(policyIdParam)) {
      throw new Error('Invalid policy ID format');
    }
    const policyId = parseInt(policyIdParam, 10);
    // Validate range (positive integer)
    if (policyId <= 0 || !Number.isInteger(policyId)) {
      throw new Error('Invalid policy ID');
    }

    const priceApp = createPriceApplicationService(c, bindingName);
    await priceApp.deletePricePolicy(user.identifier, policyId);
    return c.json({ success: true });
  }, 'Failed to delete price policy'));
  // Kích hoạt/vô hiệu hóa chính sách giá
  app.patch('/:policyId/status', createRouteHandler(async (c: any, user: any) => {
    const policyIdParam = c.req.param('policyId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(policyIdParam)) {
      throw new Error('Invalid policy ID format');
    }
    const policyId = parseInt(policyIdParam, 10);
    // Validate range (positive integer)
    if (policyId <= 0 || !Number.isInteger(policyId)) {
      throw new Error('Invalid policy ID');
    }
    const body = await c.req.json();    
    const validatedStatus = StatusSchema.parse(body.status);    
    const priceApp = createPriceApplicationService(c, bindingName);
    const result = await priceApp.updatePolicyStatus(user.identifier, policyId, validatedStatus);
    return c.json(result);
  }, 'Failed to update policy status'));

  app.post(
    '/calculate',
    createRouteHandler(async (c: any, user: any) => {
      const body = await c.req.json();
      const request = PriceCalculationRequestSchema.parse(body);
      const priceApp = createPriceApplicationService(c, bindingName);
      const result = await priceApp.calculatePrice(user.identifier, request);
      return c.json(result);
    }, 'Failed to calculate price', false),
  );


  return app;
}