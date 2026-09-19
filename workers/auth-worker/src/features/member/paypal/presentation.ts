import { Hono } from 'hono';
import { handleError } from '../../../shared/utils';
import { requireAuth } from '../../auth/authMiddleware';
import { createPaypalApplicationService } from './application';
import { PAYPAL_ERROR_MESSAGES } from './config';
import {
  applyPaypalSubscriptionToUser,
  fetchPaypalSubscription,
  paypalSubscriptionStubFromWebhook,
  rememberPaypalEvent,
  resolveUserDoForPaypalEvent,
  verifyPaypalWebhook,
} from './subscriptions';

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

  app.post('/webhook', async (c) => {
    try {
      const event = (await c.req.json()) as {
        id?: string;
        event_type?: string;
        resource?: Record<string, unknown>;
      };
      const ok = await verifyPaypalWebhook(c.env, c.req.raw.headers, event);
      if (!ok) return c.json({ error: PAYPAL_ERROR_MESSAGES.WEBHOOK_INVALID }, 400);
      const eventId = String(event.id ?? '');
      const type = String(event.event_type ?? '');
      const resource = (event.resource ?? {}) as Record<string, unknown>;
      const stub = paypalSubscriptionStubFromWebhook(type, resource);
      const fresh = await rememberPaypalEvent(c.env.D1DB, eventId, type, String(stub.custom_id ?? ''));
      if (!fresh) return c.json({ ok: true, duplicate: true });
      let sub = stub;
      if (sub.id && (!sub.plan_id || type === 'PAYMENT.SALE.COMPLETED')) {
        try {
          sub = await fetchPaypalSubscription(c.env, String(sub.id));
        } catch {
          if (!type.startsWith('BILLING.SUBSCRIPTION')) return c.json({ ok: true, skipped: true });
        }
      }
      const userDO = await resolveUserDoForPaypalEvent(c.env, bindingName, sub);
      if (userDO && (type.startsWith('BILLING.SUBSCRIPTION') || type === 'PAYMENT.SALE.COMPLETED')) {
        await applyPaypalSubscriptionToUser({ env: c.env, userDO, sub });
      }
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, PAYPAL_ERROR_MESSAGES.WEBHOOK_INVALID);
      return c.json(errorResponse, status);
    }
  });

  return app;
}
