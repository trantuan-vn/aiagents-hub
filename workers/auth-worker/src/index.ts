import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createLogger } from './shared/logger';

import {
  createAuthMiddleware,
  createIpRateLimitMiddleware,
  securityHeadersMiddleware,
  createVersionCheckMiddleware,
  createStrongAuthSetupGateMiddleware,
} from './features/auth/authMiddleware';
import { createTokenValidationMiddleware, createTokenRateLimitMiddleware, securityLoggingMiddleware } from './features/member/token/authMiddleware';
import { createAuthRoutes } from './features/auth/presentation';
import { createTokenRoutes } from './features/member/token/presentation';
import { createDashboardWebSocketRoutes, createApiWebSocketRoutes } from './features/ws/presentation';
import { createEkycRoutes } from './features/member/ekyc/presentation';
import { createOrderRoutes } from './features/member/order/presentation';
import { createPaymentRoutes } from './features/member/vnpay/presentation';
import { createAssistantRoutes } from './features/assistant/presentation';
import { createWorkflowRoutes } from './features/member/workflows/presentation';
import { createServiceRoutes } from './features/admin/service/presentation';
import { createVoucherRoutes } from './features/admin/voucher/presentation';
import { createVersionRoutes } from './features/admin/version/presentation';
import { createSystemConfigRoutes } from './features/admin/system-config/presentation';
import { createExchangeRateRoutes } from './features/admin/exchange-rate/presentation';
import { createMembershipTierRoutes } from './features/admin/membership-tier/presentation';
import { createReferralRoutes } from './features/member/referral/presentation';
import { createCommissionPolicyRoutes } from './features/member/referral/commission-policy-presentation';
import { createOverviewRoutes } from './features/member/overview/presentation';
import { createMonitorLogsRoutes } from './features/member/monitor/logs/presentation';
import { createMonitorAnalyticsRoutes } from './features/member/monitor/analytics/presentation';
import { createAdminDefaultRoutes } from './features/admin/default/presentation';
import { createAdminCrmRoutes } from './features/admin/crm/presentation';
import { createAdminFinanceRoutes } from './features/admin/finance/presentation';
import { createAdminEarningsPayoutRoutes } from './features/admin/earnings-payout/presentation';
import { createPayoutBeneficiaryRoutes } from './features/member/payout/presentation';
export { UserDO } from './features/ws/infrastructure/UserDO';
export { BroadcastServiceDO } from './features/ws/infrastructure/BroadcastServiceDO';
export { UserShardDO } from './features/ws/infrastructure/UserShardDO';
// I. CREATE ROUTES 
function createRoutes(bindingName: string) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', securityHeadersMiddleware());
  routes.use('*', createIpRateLimitMiddleware());
  // CORS middleware (must come before auth middleware)
  routes.use('/*', cors({
      origin: [
        'https://beta.aiagents-hub.vn',
        'https://www.beta.aiagents-hub.vn',
        'https://aiagents-hub.vn',
        'https://www.aiagents-hub.vn',
        'https://sandbox.vnpayment.vn',
        'https://vnpayment.vn'
      ], 
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Cookie',
        'X-Client-IP',
        'X-Client-UA',
        'X-Client-Device-Id',
      ],
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
  routes.use('/dashboard/*', createStrongAuthSetupGateMiddleware(bindingName));
  routes.use('/dashboard/*', createVersionCheckMiddleware(bindingName));      
  // sub routes /auth 
  routes.route('/dashboard/auth', createAuthRoutes(bindingName));  
  routes.route('/dashboard/ws', createDashboardWebSocketRoutes(bindingName));  
  routes.route('/dashboard/token', createTokenRoutes(bindingName)); 
  routes.route('/dashboard/order', createOrderRoutes(bindingName));  
  routes.route('/dashboard/assistant', createAssistantRoutes(bindingName));
  routes.route('/dashboard/build/workflows', createWorkflowRoutes(bindingName));
  routes.route('/dashboard/vnpay', createPaymentRoutes(bindingName));
  routes.route('/dashboard/admin/service', createServiceRoutes(bindingName));
  routes.route('/dashboard/admin/voucher', createVoucherRoutes(bindingName));
  routes.route('/dashboard/admin/membership-tier', createMembershipTierRoutes(bindingName));
  routes.route('/dashboard/admin/version', createVersionRoutes(bindingName));
  routes.route('/dashboard/admin/system-config', createSystemConfigRoutes(bindingName));
  routes.route('/dashboard/admin/exchange-rates', createExchangeRateRoutes(bindingName));
  routes.route('/dashboard/referral', createReferralRoutes(bindingName));
  routes.route('/dashboard/admin/commission-policy', createCommissionPolicyRoutes(bindingName));
  routes.route('/dashboard/overview', createOverviewRoutes(bindingName));
  routes.route('/dashboard/monitor/logs', createMonitorLogsRoutes(bindingName));
  routes.route('/dashboard/monitor/analytics', createMonitorAnalyticsRoutes(bindingName));
  routes.route('/dashboard/admin/default-stats', createAdminDefaultRoutes());
  routes.route('/dashboard/admin/crm-stats', createAdminCrmRoutes());
  routes.route('/dashboard/admin/finance-stats', createAdminFinanceRoutes());
  routes.route('/dashboard/admin/earnings-payouts', createAdminEarningsPayoutRoutes(bindingName));
  routes.route('/dashboard/payout', createPayoutBeneficiaryRoutes(bindingName));
  // II. API
  routes.use('/api/*', createTokenRateLimitMiddleware());
  routes.use('/api/*', createTokenValidationMiddleware(bindingName));
  // routes.use('/api/*', createVersionCheckMiddleware(bindingName));
  routes.use('/api/*', securityLoggingMiddleware()); 
  // sub routes /api
  routes.route('/api/ekyc', createEkycRoutes(bindingName));
  routes.route('/api/ws', createApiWebSocketRoutes(bindingName));

  return routes;
}

const routeApp = createRoutes("USER_DO");
const log = createLogger('auth-worker');

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
    try {
      const res = await env.BROADCAST_SERVICE_DO.get(
        env.BROADCAST_SERVICE_DO.idFromName("global")
      ).fetch("https://broadcast.service/dashboard/ws/health");
      if (res.status !== 200) {
        const text = await res.text();
        log.warn('warmup.broadcast_non_200', { status: res.status, bodyPreview: text.slice(0, 200) });
      } else {
        log.info('warmup.broadcast_ok');
      }
    } catch (err) {
      log.warn('warmup.broadcast_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
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