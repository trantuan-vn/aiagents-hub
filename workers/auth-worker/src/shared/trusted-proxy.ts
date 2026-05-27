import { timingSafeEqualString } from './timing-safe';

export const TRUSTED_PROXY_HEADER = 'X-Trusted-Proxy-Key';

type TrustedProxyEnv = Pick<Env, 'INTERNAL_PROXY_SECRET'>;

/** True when BFF sent the shared proxy secret (allows X-Client-IP / X-Client-UA). */
export function isTrustedProxyRequest(
  request: Request,
  env?: TrustedProxyEnv,
): boolean {
  const secret = env?.INTERNAL_PROXY_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get(TRUSTED_PROXY_HEADER)?.trim();
  if (!provided) return false;
  return timingSafeEqualString(provided, secret);
}

function edgeIpAndUa(request: Request): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const ipAddress =
    request.headers.get('CF-Connecting-IP')?.trim() ||
    request.headers.get('X-Real-IP')?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    undefined;
  const userAgent = request.headers.get('User-Agent')?.trim() || undefined;
  return { ipAddress, userAgent };
}

/**
 * IP/UA for session create + verifySession.
 * X-Client-* is honored only from trusted BFF (Next.js SSR); never from browsers.
 */
export function getClientIpAndUserAgentForSession(
  request: Request,
  env?: TrustedProxyEnv,
): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const edge = edgeIpAndUa(request);
  if (!isTrustedProxyRequest(request, env)) {
    return edge;
  }
  const xIp = request.headers.get('X-Client-IP')?.trim();
  const xUa = request.headers.get('X-Client-UA')?.trim();
  return {
    ipAddress: xIp || edge.ipAddress,
    userAgent: xUa || edge.userAgent,
  };
}
