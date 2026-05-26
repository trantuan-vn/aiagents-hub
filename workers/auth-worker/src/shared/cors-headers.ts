import type { Context } from 'hono';

/** Must match origins in index.ts cors() config. */
export const ALLOWED_CORS_ORIGINS = [
  'https://beta.aiagents-hub.vn',
  'https://www.beta.aiagents-hub.vn',
  'https://aiagents-hub.vn',
  'https://www.aiagents-hub.vn',
  'https://sandbox.vnpayment.vn',
  'https://vnpayment.vn',
] as const;

/** Apply CORS headers on early responses (429, etc.) that skip hono/cors next(). */
export function applyCorsHeadersIfAllowed(c: Context): void {
  const origin = c.req.header('Origin');
  if (!origin || !ALLOWED_CORS_ORIGINS.includes(origin as (typeof ALLOWED_CORS_ORIGINS)[number])) {
    return;
  }
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cookie, X-Client-IP, X-Client-UA, X-Client-Device-Id',
  );
  c.header('Vary', 'Origin');
}
