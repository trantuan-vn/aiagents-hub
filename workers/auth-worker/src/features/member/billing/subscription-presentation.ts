import { Hono } from 'hono';

import { getIdFromName, handleError } from '../../../shared/utils';
import { requireAuth } from '../../auth/authMiddleware';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { rollupMarketingStats } from '../../admin/system-config/marketing-stats';
import { publicPlansCatalog, paypalPlanIdFor, isPaypalBillingEnabled } from '../workflows/billing/catalog';
import { loadUserAndSyncPlan } from '../workflows/billing/billing';
import { graceMonthSpent } from '../workflows/billing/plan';
import { PAYPAL_ERROR_MESSAGES } from '../paypal/config';
import { createOrderApplicationService } from '../order/application';
import { parseCreateOrderRequest } from '../order/domain';
import {
  CancelSubscriptionSchema,
  CheckoutSubscriptionSchema,
  SyncSubscriptionSchema,
  createPaypalCheckout,
  markCancelAtPeriodEnd,
  resumePaypalSubscription,
  subscriptionSnapshot,
  syncPaypalSubscription,
} from '../paypal/subscriptions';

export function createPublicPlanRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/plans', (c) => c.json(publicPlansCatalog(c.env as unknown as Record<string, unknown> & { PAYPAL_BILLING_ENABLED?: string })));
  app.get('/stats', async (c) => {
    const stats = await rollupMarketingStats(c.env);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ success: true, data: stats });
  });
  return app;
}

export function createBillingSubscriptionRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const handler = (fn: (c: any, user: any) => Promise<Response>, fallback: string) =>
    async (c: any) => {
      try {
        const user = requireAuth(c);
        return await fn(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, fallback);
        return c.json(errorResponse, status);
      }
    };

  const userDOOf = (c: any, identifier: string) =>
    getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;

  app.get(
    '/me',
    handler(async (c, user) => {
      const userDO = userDOOf(c, user.identifier);
      const { row, quota } = await loadUserAndSyncPlan(userDO, c.env);
      const spent = graceMonthSpent(row);
      return c.json({
        ...subscriptionSnapshot(row),
        planRank: quota.planRank,
        entitlement: quota.entitlement,
        canBuyCredits: quota.canBuyCredits,
        workflowRunsRemaining: quota.workflowRunsRemaining,
        graceCreditsRemaining: Math.max(0, quota.entitlement.graceCreditsPerMonth - spent.credits),
        billingEnabled: publicPlansCatalog(c.env as unknown as Record<string, unknown> & { PAYPAL_BILLING_ENABLED?: string }).billingEnabled,
      });
    }, 'Failed to load subscription'),
  );

  app.post(
    '/checkout',
    handler(async (c, user) => {
      const body = CheckoutSubscriptionSchema.parse(await c.req.json());
      const locale = String(c.req.header('accept-language') ?? '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
      const env = c.env as unknown as Record<string, unknown> & { PAYPAL_BILLING_ENABLED?: string };
      const wantSub = body.method !== 'order';
      const paypalPlanId = paypalPlanIdFor(body.planId, body.interval, env);
      if (wantSub && isPaypalBillingEnabled(env) && paypalPlanId) {
        try {
          const result = await createPaypalCheckout({
            env: c.env,
            userDO: userDOOf(c, user.identifier),
            identifier: String(user.identifier),
            planId: body.planId,
            interval: body.interval,
            locale,
          });
          return c.json({ mode: 'paypal', ...result });
        } catch {
          /* fall through to Casso / PayPal Orders prepaid */
        }
      }
      const orderApp = createOrderApplicationService(c, bindingName);
      const created = await orderApp.createOrder(
        user,
        parseCreateOrderRequest({ planId: body.planId, interval: body.interval, amount: 1, currency: 'USD' }, 1),
      );
      const orderId = Number(created.id);
      return c.json({
        mode: 'order',
        orderId,
        checkoutPath: `/dashboard/control/billing?payOrder=${orderId}`,
      });
    }, PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CREATE_FAILED),
  );

  app.post(
    '/sync',
    handler(async (c, user) => {
      const body = SyncSubscriptionSchema.parse(await c.req.json());
      const snap = await syncPaypalSubscription({
        env: c.env,
        userDO: userDOOf(c, user.identifier),
        paypalSubscriptionId: body.paypalSubscriptionId,
      });
      return c.json(snap);
    }, PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_NOT_FOUND),
  );

  app.post(
    '/cancel',
    handler(async (c, user) => {
      const body = CancelSubscriptionSchema.parse(await c.req.json().catch(() => ({})));
      const snap = await markCancelAtPeriodEnd({
        env: c.env,
        userDO: userDOOf(c, user.identifier),
        reason: body.reason,
      });
      return c.json(snap);
    }, PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CANCEL_FAILED),
  );

  app.post(
    '/resume',
    handler(async (c, user) => {
      const snap = await resumePaypalSubscription(userDOOf(c, user.identifier));
      return c.json(snap);
    }, PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CANCEL_FAILED),
  );

  app.post(
    '/auto-topup',
    handler(async (c) => {
      return c.json({ error: 'Auto top-up requires a vaulted PayPal card (not enabled yet)' }, 503);
    }, 'Auto top-up unavailable'),
  );

  return app;
}
