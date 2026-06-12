import { Context } from 'hono';
import { getIdFromName, getIdFromString } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createApiTokenService } from './infrastructure';
import { 
  CreateApiToken,
  RevokeApiToken,
  UpdateApiToken,
} from './domain';
import { createServiceInfrastructureService } from '../../admin/service/infrastructure';
import { getPermissionGroups, toServicePermissionRow, isApprovedActiveService } from './permissions';

interface ITokenApplicationService {
  // Token Management
  createApiTokenUseCase(identifier: string, request: CreateApiToken): Promise<{ apiToken: any; rawToken: string; warning?: string }>;
  updateApiTokenUseCase(identifier: string, tokenId: number, request: UpdateApiToken): Promise<{ apiToken: any }>;
  revokeApiTokenUseCase(identifier: string, request: RevokeApiToken): Promise<{ success: boolean }>;
  revokeAllApiTokensUseCase(identifier: string): Promise<{ success: boolean }>;
  getUserApiTokensUseCase(identifier: string): Promise<{ tokens: any[] }>;
  getPermissionGroupsUseCase(identifier: string): Promise<ReturnType<typeof getPermissionGroups>>;
  // Token Validation
  validateApiTokenUseCase(clientId: string, token: string): Promise<{ isValid: boolean; token?: any; error?: string; permissions?: string[] }>;
}

export function createTokenApplicationService(c: Context, bindingName: string): ITokenApplicationService {
  const getTokenService = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    return createApiTokenService(c.env, userDO);
  };

  const getTokenServiceByClientId = (clientId: string) => {
    const userDO = getIdFromString(c, clientId, bindingName) as DurableObjectStub<UserDO>;
    return createApiTokenService(c.env, userDO);
  };

  return {
    async createApiTokenUseCase(identifier: string, request: CreateApiToken): Promise<{ apiToken: any; rawToken: string; warning?: string }> {
      const tokenService = getTokenService(identifier);
      const result = await tokenService.createApiToken(identifier, request);
      
      const response = {
        apiToken: {
          id: result.apiToken.id,
          name: result.apiToken.name,
          permissions: result.apiToken.permissions,
          expiresAt: result.apiToken.expiresAt,
          createdAt: result.apiToken.createdAt
        },
        rawToken: result.rawToken,
        warning: 'Store this token securely! It will not be shown again.'
      };

      return response;
    },

    async getUserApiTokensUseCase(identifier: string): Promise<{ tokens: any[] }> {
      const tokenService = getTokenService(identifier);
      const tokens = await tokenService.getUserApiTokens();
      return { tokens };
    },

    async getPermissionGroupsUseCase(identifier: string) {
      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const serviceInfra = createServiceInfrastructureService(userDO);
      const rows = await serviceInfra.getApprovedActiveServices();
      const services = (Array.isArray(rows) ? rows : [])
        .filter((row) => isApprovedActiveService(row as Record<string, unknown>))
        .map((row) => toServicePermissionRow(row as Record<string, unknown>))
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return getPermissionGroups(services);
    },

    async updateApiTokenUseCase(identifier: string, tokenId: number, request: UpdateApiToken) {
      const tokenService = getTokenService(identifier);
      const apiToken = await tokenService.updateApiToken(tokenId, request);
      return {
        apiToken: {
          id: apiToken.id,
          name: apiToken.name,
          permissions: apiToken.permissions,
          expiresAt: apiToken.expiresAt,
          createdAt: apiToken.createdAt,
          isActive: apiToken.isActive,
        },
      };
    },

    async revokeApiTokenUseCase(identifier: string, request: RevokeApiToken): Promise<{ success: boolean }> {
      const tokenService = getTokenService(identifier);
      await tokenService.revokeApiToken(request.tokenId);
      return { success: true };
    },

    async revokeAllApiTokensUseCase(identifier: string): Promise<{ success: boolean }> {
      const tokenService = getTokenService(identifier);
      await tokenService.revokeAllApiTokens();
      return { success: true };
    },

    async validateApiTokenUseCase(clientId: string, token: string): Promise<{ isValid: boolean; token?: any; error?: string; permissions?: string[] }> {
      const tokenService = getTokenServiceByClientId(clientId);
      return await tokenService.validateApiToken(token);
    }
  };
}