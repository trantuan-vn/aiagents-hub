import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { CloudflareUsageError, isPricingCatalog, type PricingCatalog } from './domain.js';
import { getOverview, refreshOverview, refreshPricingCatalog } from './infrastructure.js';

function usageErrorResponse(e: CloudflareUsageError) {
  return {
    error: e.message,
    code: e.code,
  };
}

export function createAdminCloudflareUsageRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/overview', async (c) => {
    try {
      requireAdmin(c);
      const data = await getOverview(c.env);
      return c.json(data);
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load Cloudflare usage');
      return c.json(errorResponse, status);
    }
  });

  app.get('/metrics', async (c) => {
    try {
      requireAdmin(c);
      const data = await getOverview(c.env);
      const family = c.req.query('family');
      const status = c.req.query('status');
      let metrics = data.metrics;
      if (family) metrics = metrics.filter((m) => m.family === family);
      if (status) metrics = metrics.filter((m) => m.status === status);
      return c.json({
        metrics,
        asOf: data.asOf,
        costSource: data.costSource,
        cachedAt: data.cachedAt,
        plans: data.plans,
      });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load Cloudflare metrics');
      return c.json(errorResponse, status);
    }
  });

  app.get('/inventory', async (c) => {
    try {
      requireAdmin(c);
      const data = await getOverview(c.env);
      return c.json({ inventory: data.inventory, cachedAt: data.cachedAt });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load Cloudflare inventory');
      return c.json(errorResponse, status);
    }
  });

  app.get('/recommendations', async (c) => {
    try {
      requireAdmin(c);
      const data = await getOverview(c.env);
      return c.json({ recommendations: data.recommendations, cachedAt: data.cachedAt });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to load Cloudflare recommendations');
      return c.json(errorResponse, status);
    }
  });

  app.post('/refresh', async (c) => {
    try {
      const user = requireAdmin(c);
      const data = await refreshOverview(c.env, String(user.identifier ?? 'admin'));
      return c.json(data);
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to refresh Cloudflare usage');
      return c.json(errorResponse, status);
    }
  });

  app.post('/pricing-catalog/refresh', async (c) => {
    try {
      const user = requireAdmin(c);
      const actor = String(user.identifier ?? 'admin');
      let body: { confirm?: boolean; catalog?: PricingCatalog } = {};
      try {
        body = (await c.req.json()) as { confirm?: boolean; catalog?: PricingCatalog };
      } catch {
        body = {};
      }
      if (body.confirm !== true) {
        throw new CloudflareUsageError('catalog_confirm_required', 'Pass { confirm: true } to refresh the pricing catalog', 400);
      }
      if (body.catalog && !isPricingCatalog(body.catalog)) {
        throw new CloudflareUsageError('catalog_confirm_required', 'catalog is not a valid pricing catalog', 400);
      }
      const catalog = await refreshPricingCatalog(c.env, actor, body.catalog);
      return c.json({ success: true, catalog: { version: catalog.version, asOf: catalog.asOf } });
    } catch (e) {
      if (e instanceof CloudflareUsageError) {
        return c.json(usageErrorResponse(e), e.status);
      }
      const { errorResponse, status } = await handleError(c, e, 'Failed to refresh pricing catalog');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
