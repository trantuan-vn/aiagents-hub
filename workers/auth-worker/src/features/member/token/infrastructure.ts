import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  IApiTokenService,
  ITokenGenerator,
  IPermissionService,
  ApiToken,
  CreateApiToken,
  UpdateApiToken,
} from './domain';
import { DEFAULT_PERMISSIONS, ERROR_MESSAGES } from './constant';
import {
  getAllowedPermissionPaths,
  isApprovedActiveService,
  toServicePermissionRow,
} from './permissions';
import { tokenGenerationUtils } from './utils';

import { executeUtils } from '../../../shared/utils';
export function createApiTokenService(env:Env, userDO: DurableObjectStub<UserDO>): IApiTokenService {
  // -----------------------------------------------------------------------------
  // Token Generator Implementation
  // -----------------------------------------------------------------------------
  const createTokenGenerator = (): ITokenGenerator => {
    
    return {
      generateToken(): string {
        return tokenGenerationUtils.generateSecureToken();
      },

      async hashToken(token: string): Promise<string> {
        const jwtSecret= await env.JWT_SECRET.get();
        if (!jwtSecret) {
          throw new Error("JWT_SECRET is not defined in environment variables");
        }
        return await tokenGenerationUtils.hashToken(token, jwtSecret);
      },

      async verifyToken(token: string, hash: string): Promise<boolean> {
        const jwtSecret= await env.JWT_SECRET.get();
        if (!jwtSecret) {
          throw new Error("JWT_SECRET is not defined in environment variables");
        }
        return await tokenGenerationUtils.verifyToken(token, hash, jwtSecret);
      },
    };
  };

  // -----------------------------------------------------------------------------
  // Permission Service Implementation
  // -----------------------------------------------------------------------------
  const createPermissionService = (): IPermissionService => {
    return {
      validatePermissions(required: string[], userPerms: string[]): boolean {
        if (userPerms.includes('admin:all')) return true;
        return required.every(p => userPerms.includes(p));
      },

      getAvailablePermissions(): string[] {
        return [...DEFAULT_PERMISSIONS];
      },


      createDefaultPermissions(): string[] {
        return [...DEFAULT_PERMISSIONS];
      },
    };
  };

  // Helper methods
  const calculateExpiryDate = (expiresInDays?: number): string | undefined => {
    if (!expiresInDays) return undefined;
    
    return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  };

  const sanitizeTokenForResponse = (tokens: any[]): any[] => {
    return tokens.map(({ tokenHash, ...token }) => token);
  };

  const listApprovedServicePermissions = async () => {
    const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'services');
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list
      .filter((row) => isApprovedActiveService(row as Record<string, unknown>))
      .map((row) => toServicePermissionRow(row as Record<string, unknown>))
      .filter((row): row is NonNullable<typeof row> => row !== null);
  };

  const validateRequestedPermissions = async (permissions: string[]) => {
    const serviceRows = await listApprovedServicePermissions();
    const allowed = new Set(getAllowedPermissionPaths(serviceRows));
    const requested = [...new Set(permissions)];
    const invalid = requested.filter((perm) => !allowed.has(perm));
    if (invalid.length > 0) {
      throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
    }
    return requested;
  };

  // Token Management Methods
  const createToken = async (identifier: string, request: CreateApiToken): Promise<{apiToken: any, rawToken: string}> => {
    const tokenGenerator = createTokenGenerator();

    const rawToken = tokenGenerator.generateToken();
    const tokenHash = await tokenGenerator.hashToken(rawToken);
    const expiresAt = calculateExpiryDate(request.expiresInDays);

    const mergedPerms = request.permissions?.length
      ? await validateRequestedPermissions(request.permissions)
      : [];

    const apiToken: ApiToken = {
      identifier,
      name: request.name,
      tokenHash,
      permissions: mergedPerms,
      expiresAt,
      isActive: true,
    };

    const createdToken = await executeUtils.executeDynamicAction(userDO, 'insert', apiToken, 'api_tokens');
    
    return { 
      apiToken: createdToken, 
      rawToken 
    };
  };

  const getUserTokens = async (): Promise<any[]> => {
    const tokens = await executeUtils.executeRepositorySelect(userDO,
      'SELECT * FROM api_tokens WHERE isActive = ? ORDER BY created_at DESC',
      [1], "api_tokens"
    );
    
    return sanitizeTokenForResponse(tokens);
  };

  const updateToken = async (tokenId: number, request: UpdateApiToken): Promise<any> => {
    const rows = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'id', operator: '=', value: tokenId } },
      'api_tokens',
    );
    const existing = Array.isArray(rows) ? rows[0] : rows;
    if (!existing || !existing.isActive) {
      throw new Error(ERROR_MESSAGES.TOKEN.TOKEN_NOT_FOUND);
    }

    const patch: Record<string, unknown> = { id: tokenId };
    if (request.name !== undefined) patch.name = request.name;
    if (request.permissions !== undefined) {
      patch.permissions = await validateRequestedPermissions(request.permissions);
    }
    if (Object.keys(patch).length === 1) {
      return existing;
    }

    return await executeUtils.executeDynamicAction(userDO, 'update', patch, 'api_tokens');
  };

  const revokeToken = async (tokenId: number): Promise<void> => {    
    await executeUtils.executeDynamicAction(userDO, 'update', { 
      id: tokenId, 
      isActive: false 
    }, 'api_tokens');
  };

  const revokeAllTokens = async (): Promise<void> => {
    await executeUtils.executeTransaction(userDO, [
      {
        sql: 'UPDATE api_tokens SET isActive = 0',
        params: []
      }
    ]);
  };

  const validateToken = async (token: string): Promise<{ isValid: boolean; token?: ApiToken; error?: string }> => {    
    const jwtSecret= await env.JWT_SECRET.get();
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    const tokenHash = await tokenGenerationUtils.hashToken(token, jwtSecret);
    const allTokens = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [
        { field: 'isActive', operator: '=', value: 1 },
        { field: 'expiresAt', operator: '>=', value: new Date().toISOString() },
        { field: 'tokenHash', operator: '=', value: tokenHash },
      ],
    }, 'api_tokens');    
    if (allTokens.length === 0) {
      return { 
        isValid: false, 
        error: ERROR_MESSAGES.TOKEN.INVALID_TOKEN 
      };
    }
    return { isValid: true, token: allTokens[0] };
  };

  return {
    // -------------------------------------------------------------------------
    // I. TOKEN MANAGEMENT
    // -------------------------------------------------------------------------
    createApiToken: (identifier: string, request: CreateApiToken) => 
      createToken(identifier, request),

    getUserApiTokens: () => 
      getUserTokens(),

    updateApiToken: (tokenId: number, request: UpdateApiToken) =>
      updateToken(tokenId, request),

    revokeApiToken: (tokenId: number) => 
      revokeToken(tokenId),

    revokeAllApiTokens: () => 
      revokeAllTokens(),

    // -------------------------------------------------------------------------
    // II. VALIDATION
    // -------------------------------------------------------------------------
    validateApiToken: (token: string) => 
      validateToken(token),
  };
}