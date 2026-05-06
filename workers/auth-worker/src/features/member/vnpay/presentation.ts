import { Hono } from 'hono';
import { handleError, getClientIp } from '../../../shared/utils';
import { createPaymentApplicationService } from './application';
import { requireAuth } from '../../auth/authMiddleware';
import { PAYMENT_ERROR_MESSAGES } from './constant';

export function createPaymentRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // Helper function để xử lý route chung
  const createRouteHandler = (
    handler: Function, 
    errorMessage: string,
    isErrorReturn: boolean = true
  ) => {
    return async (c: any) => {
      try {
        return await handler(c);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        if (isErrorReturn) return c.json(errorResponse, status);
      }
    };
  };

  // Create payment URL
  app.post('/create_payment_url', createRouteHandler(async (c: any) => {
    const user = requireAuth(c);
    const request = await c.req.json();
    const ipAddr = getClientIp(c);
    
    const paymentService = createPaymentApplicationService(c, bindingName);
    const paymentUrl = await paymentService.createPaymentUrlUseCase(
      user.identifier, 
      request, 
      ipAddr
    );
    
    return c.json({ paymentUrl });
  }, PAYMENT_ERROR_MESSAGES.INVALID_REQUEST));

  // VNPay return URL
  app.get('/vnpay_return', async (c: any) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://aiagents-hub.vn';
    const redirectUrl = new URL(`${frontendUrl}/dashboard/control/billing`);
    
    try {
      const params = c.req.query();      
      const paymentService = createPaymentApplicationService(c, bindingName);
      const result = await paymentService.processReturnUseCase(params);      
      // Redirect về frontend với thông tin kết quả
      redirectUrl.searchParams.set('payment_result', result.success ? 'success' : 'failed');
      redirectUrl.searchParams.set('message', result.message);
    } catch (e) {
      const { errorResponse } = await handleError(c, e, PAYMENT_ERROR_MESSAGES.INVALID_REQUEST);
      // Nếu có lỗi, vẫn redirect về frontend với thông tin lỗi
      redirectUrl.searchParams.set('payment_result', 'failed');
    }
    
    return c.redirect(redirectUrl.toString());
  });

  // VNPay IPN URL
  app.get('/vnpay_ipn', createRouteHandler(async (c: any) => {
    const params = c.req.query();
    
    const paymentService = createPaymentApplicationService(c, bindingName);
    const result = await paymentService.processIPNUseCase(params);
    
    return c.json({
      RspCode: result.code,
      Message: result.message
    });
  }, PAYMENT_ERROR_MESSAGES.INVALID_REQUEST, false));

  // Query transaction
  app.post('/querydr', createRouteHandler(async (c: any) => {
    const user = requireAuth(c);
    const request = await c.req.json();
    const ipAddr = getClientIp(c);
    
    const paymentService = createPaymentApplicationService(c, bindingName);
    const result = await paymentService.queryTransactionUseCase(
      user.identifier, 
      request, 
      ipAddr
    );
    
    return c.json({
      success: result.responseCode === '00',
      data: result
    });
  }, PAYMENT_ERROR_MESSAGES.QUERY_FAILED));

  // Refund transaction
  app.post('/refund', createRouteHandler(async (c: any) => {
    const user = requireAuth(c);
    const request = await c.req.json();
    const ipAddr = getClientIp(c);
    
    const paymentService = createPaymentApplicationService(c, bindingName);
    const result = await paymentService.refundTransactionUseCase(
      user.identifier, 
      request, 
      ipAddr
    );
    
    return c.json({
      success: result.responseCode === '00',
      data: result
    });
  }, PAYMENT_ERROR_MESSAGES.REFUND_FAILED));

  return app;
}