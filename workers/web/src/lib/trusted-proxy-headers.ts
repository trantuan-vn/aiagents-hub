/** Headers for server-side auth API calls (SSR). Never expose INTERNAL_PROXY_SECRET to the client. */
export function buildTrustedProxyHeaders(opts?: {
  ip?: string;
  ua?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  const secret = process.env.INTERNAL_PROXY_SECRET?.trim();
  if (secret) {
    headers['X-Trusted-Proxy-Key'] = secret;
  }
  if (opts?.ip) headers['X-Client-IP'] = opts.ip;
  if (opts?.ua) headers['X-Client-UA'] = opts.ua;
  return headers;
}
