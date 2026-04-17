import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createAuthMiddleware, createRateLimitMiddleware, securityHeadersMiddleware, createVersionCheckMiddleware } from './features/auth/authMiddleware';
import { createTokenValidationMiddleware, securityLoggingMiddleware } from './features/member/token/authMiddleware';
import { createAuthRoutes } from './features/auth/presentation';
import { createTokenRoutes } from './features/member/token/presentation';
import { createDashboardWebSocketRoutes, createApiWebSocketRoutes } from './features/ws/presentation';
import { createEkycRoutes } from './features/member/ekyc/presentation';
import { createOrderRoutes } from './features/member/order/presentation';
import { createPaymentRoutes } from './features/member/vnpay/presentation';
import { createAssistantRoutes } from './features/member/assistant/presentation';
import { createPriceRoutes } from './features/admin/policy/presentation';
import { createServiceRoutes } from './features/admin/service/presentation';
import { createVoucherRoutes } from './features/admin/voucher/presentation';
import { createVersionRoutes } from './features/admin/version/presentation';
import { createSystemConfigRoutes } from './features/admin/system-config/presentation';
import { createReferralRoutes } from './features/referral/presentation';
import { createCommissionPolicyRoutes } from './features/referral/commission-policy-presentation';
import { createOverviewRoutes } from './features/dashboard/overview/presentation';
import { createMonitorLogsRoutes } from './features/dashboard/monitor/logs/presentation';
import { createMonitorAnalyticsRoutes } from './features/dashboard/monitor/analytics/presentation';
import { createAdminDefaultRoutes } from './features/dashboard/admin-default/presentation';
import { createAdminCrmRoutes } from './features/dashboard/admin-crm/presentation';
import { createAdminFinanceRoutes } from './features/dashboard/admin-finance/presentation';
export { UserDO } from './features/ws/infrastructure/UserDO';
export { BroadcastServiceDO } from './features/ws/infrastructure/BroadcastServiceDO';
export { UserShardDO } from './features/ws/infrastructure/UserShardDO';
// I. CREATE ROUTES 
function createRoutes(bindingName: string) {
  const routes = new Hono<{ Bindings: Env }>();
  // routes.use('*', createRateLimitMiddleware()); 
  // Security headers
  routes.use('*', securityHeadersMiddleware());
  // CORS middleware (must come before auth middleware)
  routes.use('/*', cors({
      origin: [
        'https://beta.unitoken.trade',
        'https://www.beta.unitoken.trade',
        'https://unitoken.trade',
        'https://www.unitoken.trade',
        'https://sandbox.vnpayment.vn',
        'https://vnpayment.vn'
      ], 
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true, 
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  }));
  // Handle OPTIONS preflight for all routes (must be before other routes)
  routes.options('*', async (c: any) => {
    return new Response(null, { status: 204 });
  });

  // I. DASHBOARD
  // Auth middleware
  routes.use('/dashboard/*', createAuthMiddleware(bindingName));  
  routes.use('/dashboard/*', createVersionCheckMiddleware(bindingName));      
  // sub routes /auth 
  routes.route('/dashboard/auth', createAuthRoutes(bindingName));  
  routes.route('/dashboard/ws', createDashboardWebSocketRoutes(bindingName));  
  routes.route('/dashboard/token', createTokenRoutes(bindingName)); 
  routes.route('/dashboard/order', createOrderRoutes(bindingName));  
  routes.route('/dashboard/assistant', createAssistantRoutes(bindingName));
  routes.route('/dashboard/vnpay', createPaymentRoutes(bindingName));
  routes.route('/dashboard/admin/policy', createPriceRoutes(bindingName));
  routes.route('/dashboard/admin/service', createServiceRoutes(bindingName));
  routes.route('/dashboard/admin/voucher', createVoucherRoutes(bindingName));
  routes.route('/dashboard/admin/version', createVersionRoutes(bindingName));
  routes.route('/dashboard/admin/system-config', createSystemConfigRoutes(bindingName));
  routes.route('/dashboard/referral', createReferralRoutes(bindingName));
  routes.route('/dashboard/admin/commission-policy', createCommissionPolicyRoutes(bindingName));
  routes.route('/dashboard/overview', createOverviewRoutes(bindingName));
  routes.route('/dashboard/monitor/logs', createMonitorLogsRoutes(bindingName));
  routes.route('/dashboard/monitor/analytics', createMonitorAnalyticsRoutes(bindingName));
  routes.route('/dashboard/admin/default-stats', createAdminDefaultRoutes());
  routes.route('/dashboard/admin/crm-stats', createAdminCrmRoutes());
  routes.route('/dashboard/admin/finance-stats', createAdminFinanceRoutes());
  // II. API
  // Security middleware
  routes.use('/api/*', createTokenValidationMiddleware(bindingName));  
  // routes.use('/api/*', createVersionCheckMiddleware(bindingName));
  routes.use('/api/*', securityLoggingMiddleware()); 
  // sub routes /api
  routes.route('/api/ekyc', createEkycRoutes(bindingName));
  routes.route('/api/ws', createApiWebSocketRoutes(bindingName));

  return routes;
}

const routeApp = createRoutes("USER_DO");

// Warmup BroadcastServiceDO once per isolate so its tables are created on deploy.
// UserDO tables are created when the first user connects; BroadcastServiceDO is a
// singleton and is only created when first requested — without warmup, tables never exist.
// IMPORTANT: We await warmup so tables are guaranteed to exist before any request is processed.
// Using waitUntil() caused a race where the first request could reach BroadcastServiceDO
// before warmup completed, leading to "table not found" errors.
let warmupPromise: Promise<void> | null = null;
async function warmupBroadcastServiceDO(env: Env): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    console.log("[auth-worker] BroadcastServiceDO warmup: triggering");
    try {
      const res = await env.BROADCAST_SERVICE_DO.get(
        env.BROADCAST_SERVICE_DO.idFromName("global")
      ).fetch("https://broadcast.service/dashboard/ws/health");
      console.log("[auth-worker] BroadcastServiceDO warmup: done", res.status);
      if (res.status !== 200) {
        const text = await res.text();
        console.warn("[auth-worker] BroadcastServiceDO warmup: non-200 response", text);
      }
    } catch (err) {
      console.warn("[auth-worker] BroadcastServiceDO warmup: failed", err);
      warmupPromise = null;
      throw err;
    }
  })();
  return warmupPromise;
}

// III. CREATE MAIN APP
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    await warmupBroadcastServiceDO(env);
    return routeApp.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env, Error>;