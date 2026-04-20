import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createCommissionPolicyInfrastructure } from './commission-policy-infrastructure';
import { CommissionPolicySchema } from './domain';

const COMMISSION_ADMIN_IDENTIFIER = 'tuanta2021@gmail.com';

export function createCommissionPolicyRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: Function, errorMessage: string) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        if (user.role !== 'admin') {
          throw new Error('Insufficient permissions');
        }
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  const getAdminInfra = (c: any) => {
    const adminDO = getIdFromName(c, COMMISSION_ADMIN_IDENTIFIER, bindingName) as DurableObjectStub<UserDO>;
    return createCommissionPolicyInfrastructure(adminDO);
  };

  app.post('/new', createRouteHandler(async (c: any) => {
    const body = await c.req.json();
    const request = CommissionPolicySchema.parse(body);
    const infra = getAdminInfra(c);
    const result = await infra.create(request);
    return c.json(result);
  }, 'Failed to create commission policy'));

  app.put('/:policyId', createRouteHandler(async (c: any) => {
    const policyId = parseInt(c.req.param('policyId'), 10);
    if (isNaN(policyId) || policyId <= 0) throw new Error('Invalid policy ID');
    const body = await c.req.json();
    const request = CommissionPolicySchema.parse(body);
    const infra = getAdminInfra(c);
    const result = await infra.update(policyId, request);
    return c.json(result);
  }, 'Failed to update commission policy'));

  app.get('/get', createRouteHandler(async (c: any) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const status = c.req.query('status') as string | undefined;
    const infra = getAdminInfra(c);
    const result = await infra.list(limit, offset, status);
    return c.json(result);
  }, 'Failed to get commission policies'));

  app.get('/:policyId', createRouteHandler(async (c: any) => {
    const policyId = parseInt(c.req.param('policyId'), 10);
    if (isNaN(policyId) || policyId <= 0) throw new Error('Invalid policy ID');
    const infra = getAdminInfra(c);
    const result = await infra.getById(policyId);
    if (!result) throw new Error('Commission policy not found');
    return c.json(result);
  }, 'Failed to get commission policy'));

  app.delete('/:policyId', createRouteHandler(async (c: any) => {
    const policyId = parseInt(c.req.param('policyId'), 10);
    if (isNaN(policyId) || policyId <= 0) throw new Error('Invalid policy ID');
    const infra = getAdminInfra(c);
    await infra.delete(policyId);
    return c.json({ success: true });
  }, 'Failed to delete commission policy'));

  return app;
}
