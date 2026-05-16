import { Hono } from 'hono';
import { createServiceApplicationService } from './application';
import {
  ServiceSchema,
  ServicePricingUpdateSchema,
  ServiceUpdateSchema,
} from './domain';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';

function parseServiceIdParam(serviceIdParam: string): number {
  if (!/^\d+$/.test(serviceIdParam)) {
    throw new Error('Invalid service ID format');
  }
  const serviceId = parseInt(serviceIdParam, 10);
  if (serviceId <= 0 || !Number.isInteger(serviceId)) {
    throw new Error('Invalid service ID');
  }
  return serviceId;
}

export function createServiceRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (
    handler: Function,
    errorMessage: string,
    requireAdmin: boolean = true,
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

  app.post(
    '/register',
    createRouteHandler(async (c: any, user: any) => {
      const body = await c.req.json();
      const request = ServiceSchema.parse(body);
      const serviceApp = createServiceApplicationService(c, bindingName);
      const result = await serviceApp.registerService(user.identifier, request);
      return c.json(result);
    }, 'Failed to register service'),
  );

  app.get(
    '/list',
    createRouteHandler(async (c: any, user: any) => {
      const serviceApp = createServiceApplicationService(c, bindingName);
      const result = await serviceApp.getUserServices(user.identifier);
      return c.json(result);
    }, 'Failed to get services', false),
  );

  app.get(
    '/models/search',
    createRouteHandler(
      async (c: any) => {
        const search = c.req.query('search') ?? c.req.query('q') ?? '';
        const serviceApp = createServiceApplicationService(c, bindingName);
        const result = await serviceApp.searchModels(search);
        return c.json(result);
      },
      'Failed to search models',
      false,
    ),
  );

  app.put(
    '/:serviceId',
    createRouteHandler(
      async (c: any, user: any) => {
        const serviceId = parseServiceIdParam(c.req.param('serviceId'));
        const body = await c.req.json();
        const isAdmin = user.role === 'admin';
        const request = isAdmin
          ? ServiceUpdateSchema.parse(body)
          : ServicePricingUpdateSchema.parse(body);
        const serviceApp = createServiceApplicationService(c, bindingName);
        const result = await serviceApp.updateService(user.identifier, serviceId, request);
        return c.json(result);
      },
      'Failed to update service',
      false,
    ),
  );

  app.delete(
    '/cancel/:serviceId',
    createRouteHandler(async (c: any, user: any) => {
      const serviceId = parseServiceIdParam(c.req.param('serviceId'));
      const serviceApp = createServiceApplicationService(c, bindingName);
      await serviceApp.cancelService(user.identifier, serviceId);
      return c.json({ success: true });
    }, 'Failed to cancel service'),
  );

  app.get(
    '/usage/:serviceId',
    createRouteHandler(async (c: any, user: any) => {
      const serviceId = parseServiceIdParam(c.req.param('serviceId'));
      const days = c.req.query('days') ? parseInt(c.req.query('days')!) : 30;
      const serviceApp = createServiceApplicationService(c, bindingName);
      const result = await serviceApp.getServiceUsage(user.identifier, serviceId, days);
      return c.json(result);
    }, 'Failed to get service usage'),
  );

  return app;
}
