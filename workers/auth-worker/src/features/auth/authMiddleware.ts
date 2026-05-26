import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { createApplicationService } from './application';
import { createVersionApplicationService } from '../admin/version/application';
import { syncUserMembershipTierOnAccess } from '../admin/membership-tier/infrastructure';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { cookieUtils } from './utils';
import { getClientIpAndUserAgentForSession, getClientIp, handleError, handleErrorWithoutIp } from '../../shared/utils';
import { isDashboardPublicPath } from '../../shared/dashboard-public-paths';
import { createIpRateLimitMiddleware, recordIpAuthFailure } from '../../shared/ip-rate-limit';
import { ERROR_MESSAGES } from './constant';

export { createIpRateLimitMiddleware };

// Main authentication middleware factory
export function createAuthMiddleware(bindingName: string) {
  return async (c: Context, next: Next) => {
    let sessionId: string | undefined;
    try {
      // Reset user context
      c.set('user', undefined);
      
      sessionId = getCookie(c, 'sessionId');
      if (!sessionId) {
        throw new Error("sessionId not found");
      }

      const { ipAddress, userAgent } = getClientIpAndUserAgentForSession(c.req.raw);

      const applicationService = createApplicationService(c, bindingName);
      const result = await applicationService.verifySessionUseCase(sessionId, ipAddress, userAgent);
      if (result.ok) {
        c.set('user', result.user);
      } else {
        throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
      }
    } catch (error) {
      handleErrorWithoutIp(error, "Auth middleware error");
      // Logout session trên server trước khi xoá cookie (invalid session, revoke sessionId nếu còn)
      if (sessionId) {
        try {
          const applicationService = createApplicationService(c, bindingName);
          await applicationService.revokeSessionBySessionIdUseCase(sessionId);
        } catch (revokeErr) {
          console.warn('[Auth] revokeSessionBySessionIdUseCase failed:', revokeErr);
        }
      }
      cookieUtils.clearAuthCookies(c);
    }

    const path = c.req.path;
    const method = c.req.method;
    if (!isDashboardPublicPath(path, method) && !c.get('user')) {
      return c.json({ error: ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED }, 401);
    }

    await next();
  };
}

// Require authentication middleware
export function requireAuth(c: Context) {
  const user = c.get('user');
  if (!user) {
    throw new Error(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED);
  }
  return user;
}

// Require admin role middleware
export function requireAdmin(c: Context) {
  const user = requireAuth(c);
  if (user.role !== 'admin') {
    throw new Error(ERROR_MESSAGES.AUTH.NOT_AUTHORIZED);
  }
  return user;
}
// Version check middleware for admin users
export function createVersionCheckMiddleware(bindingName: string) {
  return async (c: Context, next: Next) => {
    
    try {
      const user = requireAuth(c);
      const versionApplicationService = createVersionApplicationService(c, bindingName);
      await versionApplicationService.upgradeVersion(user.identifier);
      if (user.role !== 'admin') {
        const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
        await syncUserMembershipTierOnAccess(userDO, c.env);
      }
    } catch (error) {
      handleErrorWithoutIp(error, "Failed to upgrade version");      
    } 
    await next();   
  };
}

// Security headers middleware
export function securityHeadersMiddleware() {
  return async (c: Context, next: Next) => {
    await next();
    
    // Security headers
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'geolocation=(), microphone=()');
    
    // CSP header
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
    );
  };
}









/** @deprecated Use createIpRateLimitMiddleware */
export const createRateLimitMiddleware = createIpRateLimitMiddleware;

/** Record auth failure against client IP (KV key rate_limit:${ip}). */
export async function updateRateLimit(env: Env, ip: string): Promise<void> {
  await recordIpAuthFailure(env, ip);
}

// CORS middleware for auth endpoints
export function corsMiddleware() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    const allowedOrigins = [c.env.FRONTEND_URL];
    
    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Client-IP, X-Client-UA, X-Client-Device-Id');
    }
    
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    
    await next();
  };
}

// Request logging middleware — chỉ log lỗi server (5xx)
export function requestLoggingMiddleware() {
  return async (c: Context, next: Next) => {
    await next();
    if (c.res.status >= 500) {
      console.error(`${c.req.method} ${c.req.path} - ${c.res.status} - IP: ${getClientIp(c)}`);
    }
  };
}

// Error handling middleware
export function errorHandlingMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      // Handle error
      const { errorResponse, status } = await handleError(
        c, 
        error, 
        'Internal server error'
      );
      // Send error response
      return c.json(errorResponse, status);
    }
  };
}

// Composite middleware for auth routes
export function createAuthCompositeMiddleware(bindingName: string) {
  return [
    corsMiddleware(),
    securityHeadersMiddleware(),
    requestLoggingMiddleware(),
    errorHandlingMiddleware(),
    createRateLimitMiddleware(),
    createAuthMiddleware(bindingName)
  ];
}

// Route-specific middleware combinations
export const middlewarePresets = {
  public: [
    corsMiddleware(),
    securityHeadersMiddleware(),
    requestLoggingMiddleware(),
    createRateLimitMiddleware()
  ],
  
  authenticated: (bindingName: string) => [
    ...middlewarePresets.public,
    createAuthMiddleware(bindingName)
  ],
  
  adminOnly: (bindingName: string) => [
    ...middlewarePresets.authenticated(bindingName),
    (c: Context, next: Next) => {
      requireAdmin(c);
      return next();
    }
  ]
};

// Helper to apply multiple middleware
export function applyMiddleware(...middlewares: Function[]) {
  return async (c: Context, next: Next) => {
    let index = -1;
    
    async function dispatch(i: number): Promise<void> {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      
      if (i === middlewares.length) {
        return await next();
      }
      
      const middleware = middlewares[i];
      if (!middleware) {
        throw new Error(`Middleware at index ${i} is undefined`);
      }
      return await middleware(c, () => dispatch(i + 1));
    }
    
    return await dispatch(0);
  };
}

