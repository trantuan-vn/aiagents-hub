import { Context, Next } from 'hono';
import { createTokenApplicationService } from './application.js';
import { handleError, getClientIp } from '../../../shared/utils';
import { isApiPublicPath } from '../../../shared/api-public-paths';
import { applyCorsHeadersIfAllowed } from '../../../shared/cors-headers';
import { TOKEN_CONSTANTS, ERROR_MESSAGES } from './constant';
import { 
  tokenValidationUtils, 
  securityUtils 
} from './utils';

export function createTokenValidationMiddleware(bindingName: string) {
  return async (c: Context, next: Next) => {
    try {
      // Luôn xóa token data cũ trước khi xác thực lại
      c.set('tokenData', undefined);

      if (isApiPublicPath(c.req.path)) {
        await next();
        return;
      }
      
      const clientId = c.req.header('X-Client-ID') || c.req.query('client_id');
      
      if (!clientId) {
        throw new Error(ERROR_MESSAGES.TOKEN.INVALID_CLIENT_ID);
      }

      if (!tokenValidationUtils.isValidClientId(clientId)) {
        throw new Error(ERROR_MESSAGES.TOKEN.INVALID_CLIENT_ID);
      }

      const authHeader = c.req.header('Authorization');
      if (!authHeader) {
        throw new Error(ERROR_MESSAGES.TOKEN.MISSING_AUTHORIZATION);
      }

      if (!tokenValidationUtils.isValidAuthHeader(authHeader)) {
        throw new Error('Invalid authorization header format');
      }

      const token = authHeader.substring(7);
      if (!token || token.length > TOKEN_CONSTANTS.MAX_TOKEN_LENGTH) {
        throw new Error(ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
      }

      if (!tokenValidationUtils.isValidTokenFormat(token)) {
        throw new Error('Invalid token format');
      }

      const applicationService = createTokenApplicationService(c, bindingName);
      const validationPromise = applicationService.validateApiTokenUseCase(clientId, token);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(ERROR_MESSAGES.TOKEN.TOKEN_VALIDATION_TIMEOUT)), TOKEN_CONSTANTS.TOKEN_TIMEOUT_MS),
      );

      const validationResult = await Promise.race([validationPromise, timeoutPromise]) as {
        isValid: boolean;
        error?: string;
        token?: unknown;
      };

      if (!validationResult.isValid) {
        throw new Error(validationResult.error || ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
      }

      c.set('tokenData', securityUtils.sanitizeTokenData(validationResult.token));

      await next();
    } catch (error) {
      const { errorResponse, status } = await handleError(c, error, 'Token validation failed');
      securityUtils.addSecurityHeaders(c);
      return c.json(errorResponse, status);
    }
  };
}

// Permission Validation
export function requirePermissions(c: Context, permissions: string[]) {
    const token = c.get('tokenData');
    
    if (!token) {
        throw new Error('Not authenticated');
    }

    // Enhanced Token Validation
    if (!tokenValidationUtils.isValidTokenStructure(token)) {
        throw new Error('Invalid token structure');
    }

    // Permission Validation
    securityUtils.validatePermissions(token, permissions);
    
    return token;
}

// Security monitoring middleware — chỉ log cảnh báo khi response lỗi
export function securityLoggingMiddleware() {
  return async (c: Context, next: Next) => {
    await next();
    if (c.res.status < 400) return;
    const tokenData = c.get('tokenData');
    console.warn('[TokenAuth]', JSON.stringify({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      userId: tokenData?.id || 'anonymous',
      clientIP: getClientIp(c),
    }));
  };
}

// Rate limiting middleware (per X-Client-ID)
export function createTokenRateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    if (isApiPublicPath(c.req.path)) {
      await next();
      return;
    }

    const clientId = c.req.header('X-Client-ID') || c.req.query('client_id');
    if (!clientId || !tokenValidationUtils.isValidClientId(clientId)) {
      await next();
      return;
    }

    const key = `token_rate_limit:${clientId}`;
    const now = Date.now();
    const windowMs = TOKEN_CONSTANTS.RATE_LIMIT_WINDOW;
    const max = TOKEN_CONSTANTS.RATE_LIMIT_MAX;

    let count = 1;
    let resetTime = now + windowMs;
    const raw = await c.env.NONCE_KV.get(key);
    if (raw) {
      const data = JSON.parse(raw) as { count: number; resetTime: number };
      if (now < data.resetTime) {
        count = data.count + 1;
        resetTime = data.resetTime;
      }
    }

    if (count > max && now < resetTime) {
      applyCorsHeadersIfAllowed(c);
      return c.json({ error: ERROR_MESSAGES.TOKEN.RATE_LIMIT_EXCEEDED }, 429);
    }

    await c.env.NONCE_KV.put(key, JSON.stringify({ count, resetTime }), {
      expirationTtl: Math.max(60, Math.ceil((windowMs * 2) / 1000)),
    });

    await next();
  };
}