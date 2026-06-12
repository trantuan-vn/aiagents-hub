import { Hono } from 'hono';
import { createTokenApplicationService } from './application';
import { CreateApiTokenSchema, RevokeApiTokenSchema, UpdateApiTokenSchema } from './domain';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';

export function createTokenRoutes(bindingName: string) {
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
      } catch (error) {
        const { errorResponse, status } = await handleError(c, error, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  // Create new API token
  app.post('/create', createRouteHandler(async (c: any, user: any) => {
    const body = await c.req.json();
    const request = CreateApiTokenSchema.parse(body);
    
    const tokenService = createTokenApplicationService(c, bindingName);
    const result = await tokenService.createApiTokenUseCase(user.identifier, request);
    return c.json(result);
  }, "Failed to create API token"));

  // List assignable permission groups for token creation
  app.get('/permissions', createRouteHandler(async (c: any, user: any) => {
    const tokenService = createTokenApplicationService(c, bindingName);
    const groups = await tokenService.getPermissionGroupsUseCase(user.identifier);
    return c.json({ groups });
  }, "Failed to get token permissions"));

  // Get all user API tokens
  app.get('/list', createRouteHandler(async (c: any, user: any) => {
    const tokenService = createTokenApplicationService(c, bindingName);
    const result = await tokenService.getUserApiTokensUseCase(user.identifier);
    return c.json(result);
  }, "Failed to get API tokens"));

  // Update API token (name / permissions)
  app.put('/:tokenId', createRouteHandler(async (c: any, user: any) => {
    const tokenIdParam = c.req.param('tokenId');
    if (!/^\d+$/.test(tokenIdParam)) {
      throw new Error('Invalid token ID format');
    }
    const tokenId = parseInt(tokenIdParam, 10);
    if (tokenId <= 0 || !Number.isInteger(tokenId)) {
      throw new Error('Invalid token ID');
    }

    const body = await c.req.json();
    const request = UpdateApiTokenSchema.parse(body);
    if (request.name === undefined && request.permissions === undefined) {
      throw new Error('Nothing to update');
    }

    const tokenService = createTokenApplicationService(c, bindingName);
    const result = await tokenService.updateApiTokenUseCase(user.identifier, tokenId, request);
    return c.json(result);
  }, "Failed to update API token"));

  // Revoke specific API token
  app.delete('/revoke/:tokenId', createRouteHandler(async (c: any, user: any) => {
    const tokenIdParam = c.req.param('tokenId');
    // Validate format first (only digits)
    if (!/^\d+$/.test(tokenIdParam)) {
      throw new Error('Invalid token ID format');
    }
    const tokenId = parseInt(tokenIdParam, 10);
    // Validate range (positive integer)
    if (tokenId <= 0 || !Number.isInteger(tokenId)) {
      throw new Error('Invalid token ID');
    }
    
    const request = RevokeApiTokenSchema.parse({ tokenId });
    
    const tokenService = createTokenApplicationService(c, bindingName);
    const result = await tokenService.revokeApiTokenUseCase(user.identifier, request);
    return c.json(result);
  }, "Failed to revoke API token"));

  // Revoke all API tokens
  app.delete('/revoke-all', createRouteHandler(async (c: any, user: any) => {
    const tokenService = createTokenApplicationService(c, bindingName);
    const result = await tokenService.revokeAllApiTokensUseCase(user.identifier);
    return c.json(result);
  }, "Failed to revoke all API tokens"));
  
  return app;
}