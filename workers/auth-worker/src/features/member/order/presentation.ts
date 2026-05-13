import { Hono } from 'hono';
import { createOrderApplicationService } from './application';
import { parseCreateOrderRequest, UpdateOrderStatusSchema, ORDER_DEFAULT_PAGE, ORDER_DEFAULT_LIMIT } from './domain';
import { getOrderHistoryFromD1, type OrderHistoryFilters } from './order-history-infrastructure';
import { getMemberBillingParamsFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';

export function createOrderRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // Helper function để xử lý route chung
  const createRouteHandler = (
    handler: Function, 
    errorMessage: string
  ) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  /** Tỉ giá + số tiền nạp tối thiểu từ system config (member đọc được). */
  app.get('/exchange-rate', createRouteHandler(async (c: any) => {
    const { usdVndRate, minTopUpVnd } = await getMemberBillingParamsFromEnv(c.env);
    return c.json({ usdVndRate, minTopUpVnd });
  }, 'Failed to get exchange rate'));

  // Tạo đơn hàng mới
  app.post('/orders', createRouteHandler(async (c: any, user: any) => {
    const body = await c.req.json();
    const { minTopUpVnd } = await getMemberBillingParamsFromEnv(c.env);
    const request = parseCreateOrderRequest(body, minTopUpVnd);
    const orderApp = createOrderApplicationService(c, bindingName);
    const result = await orderApp.createOrder(user, request);
    return c.json(result);
  }, 'Failed to create order'));

  // Lấy order history từ D1 (đã sync từ UserDO)
  app.get('/history', createRouteHandler(async (c: any, user: any) => {
    const db = c.env.D1DB;
    if (!db) {
      throw new Error('D1 database binding not configured');
    }
    const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
    const fromDate = c.req.query('fromDate') as string | undefined;
    const toDate = c.req.query('toDate') as string | undefined;
    const filters: OrderHistoryFilters = { limit, offset };
    if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) filters.fromDate = fromDate;
    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) filters.toDate = toDate;
    const result = await getOrderHistoryFromD1(db, userId, filters);
    return c.json(result);
  }, 'Failed to get order history'));

  // Lấy danh sách đơn hàng
  app.get('/orders', createRouteHandler(async (c: any, user: any) => {
    const status = c.req.query('status');
    const targetType = c.req.query('targetType') as 'SERVICE' | 'USER' | undefined;
    const page = parseInt(c.req.query('page') || ORDER_DEFAULT_PAGE);
    const limit = parseInt(c.req.query('limit') || ORDER_DEFAULT_LIMIT);
    const orderApp = createOrderApplicationService(c, bindingName);
    const result = await orderApp.getOrders(user.identifier, { status, targetType, page, limit });
    return c.json(result);
  }, 'Failed to get orders'));

  // Lấy chi tiết đơn hàng
  app.get('/orders/:orderId', createRouteHandler(async (c: any, user: any) => {
    const orderIdParam = c.req.param('orderId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(orderIdParam)) {
      throw new Error('Invalid order ID format');
    }
    const orderId = parseInt(orderIdParam, 10);
    // Validate range (positive integer)
    if (orderId <= 0 || !Number.isInteger(orderId)) {
      throw new Error('Invalid order ID');
    }
    
    
    const orderApp = createOrderApplicationService(c, bindingName);
    const result = await orderApp.getOrderDetail(user.identifier, orderId);
    return c.json(result);
  }, 'Failed to get order detail'));

  // Cập nhật trạng thái đơn hàng
  app.patch('/orders/:orderId/status', createRouteHandler(async (c: any, user: any) => {
    const orderIdParam = c.req.param('orderId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(orderIdParam)) {
      throw new Error('Invalid order ID format');
    }
    const orderId = parseInt(orderIdParam, 10);
    // Validate range (positive integer)
    if (orderId <= 0 || !Number.isInteger(orderId)) {
      throw new Error('Invalid order ID');
    }
    const body = await c.req.json();
    const request = UpdateOrderStatusSchema.parse(body);
    const orderApp = createOrderApplicationService(c, bindingName);
    const result = await orderApp.updateOrderStatus(user.identifier, orderId, request);
    return c.json(result);
  }, 'Failed to update order status'));

  // Hủy đơn hàng
  app.post('/orders/:orderId/cancel', createRouteHandler(async (c: any, user: any) => {
    const orderIdParam = c.req.param('orderId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(orderIdParam)) {
      throw new Error('Invalid order ID format');
    }
    const orderId = parseInt(orderIdParam, 10);
    // Validate range (positive integer)
    if (orderId <= 0 || !Number.isInteger(orderId)) {
      throw new Error('Invalid order ID');
    }
    const orderApp = createOrderApplicationService(c, bindingName);
    const result = await orderApp.cancelOrder(user.identifier, orderId);
    return c.json(result);
  }, 'Failed to cancel order'));

  return app;
}