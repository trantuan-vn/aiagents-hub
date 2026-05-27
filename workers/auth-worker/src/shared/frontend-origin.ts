import { ALLOWED_CORS_ORIGINS } from './cors-headers';

/** Origins allowed for browser auth flows (passkey, etc.) — excludes payment iframes. */
const FRONTEND_AUTH_ORIGINS = ALLOWED_CORS_ORIGINS.filter(
  (o) => o.includes('aiagents-hub.vn'),
);

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Resolve request origin from Origin header, or Referer URL when Origin is absent. */
export function resolveRequestOrigin(
  originHeader: string | undefined,
  refererHeader: string | undefined,
): string | null {
  const fromOrigin = originHeader?.trim();
  if (fromOrigin) {
    const parsed = parseOrigin(fromOrigin);
    if (parsed) return parsed;
  }

  const fromReferer = refererHeader?.trim();
  if (fromReferer) {
    return parseOrigin(fromReferer);
  }

  return null;
}

function buildAllowedOrigins(frontendUrl: string): Set<string> {
  const allowed = new Set<string>(FRONTEND_AUTH_ORIGINS);
  const fromEnv = parseOrigin(frontendUrl.trim());
  if (fromEnv) allowed.add(fromEnv);
  return allowed;
}

/** True when Origin/Referer matches an allowed frontend origin (exact, not prefix). */
export function isAllowedFrontendOrigin(
  originHeader: string | undefined,
  refererHeader: string | undefined,
  frontendUrl: string,
): boolean {
  const requestOrigin = resolveRequestOrigin(originHeader, refererHeader);
  if (!requestOrigin) return false;
  return buildAllowedOrigins(frontendUrl).has(requestOrigin);
}

export function assertAllowedFrontendOrigin(
  originHeader: string | undefined,
  refererHeader: string | undefined,
  frontendUrl: string,
): void {
  if (!isAllowedFrontendOrigin(originHeader, refererHeader, frontendUrl)) {
    throw new Error('Invalid origin');
  }
}
