import { Hono } from 'hono';
import { handleError } from '../../../shared/utils';
import { requireAuth } from '../../auth/authMiddleware';
import { createPaypalApplicationService } from './application';
import { PAYPAL_ERROR_MESSAGES } from './config';

export function createPaypalRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: Function, errorMessage: string) => {
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

  // Public PayPal config for the browser SDK (client id is not secret).
  app.get(
    '/config',
    createRouteHandler(async (c: any) => {
      const paypalApp = createPaypalApplicationService(c, bindingName);
      return c.json(await paypalApp.getPublicConfigUseCase());
    }, PAYPAL_ERROR_MESSAGES.CONFIG_MISSING),
  );

  // Create a PayPal order for an internal order (JS SDK Buttons createOrder()).
  app.post(
    '/create_order',
    createRouteHandler(async (c: any, user: any) => {
      const request = await c.req.json();
      const paypalApp = createPaypalApplicationService(c, bindingName);
      const result = await paypalApp.createOrderUseCase(user.identifier, request);
      return c.json(result);
    }, PAYPAL_ERROR_MESSAGES.CREATE_FAILED),
  );

  // Capture an approved PayPal order and credit the USD wallet (JS SDK Buttons onApprove()).
  app.post(
    '/capture_order',
    createRouteHandler(async (c: any, user: any) => {
      const request = await c.req.json();
      const paypalApp = createPaypalApplicationService(c, bindingName);
      const result = await paypalApp.captureOrderUseCase(user.identifier, request);
      return c.json(result);
    }, PAYPAL_ERROR_MESSAGES.CAPTURE_FAILED),
  );

  return app;
}
