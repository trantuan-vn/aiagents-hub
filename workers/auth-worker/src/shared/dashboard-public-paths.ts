/** GET khởi tạo login — không chặn flood dù IP đang bị giới hạn verify. */
export function isAuthBootstrapGet(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  if (/^\/dashboard\/auth\/oauth\/[^/]+\/url$/.test(path)) return true;
  if (path === '/dashboard/auth/wallet/nonce') return true;
  if (path === '/dashboard/auth/passkey/auth/status') return true;
  if (path === '/dashboard/auth/captcha/config') return true;
  return false;
}

/** Login / OAuth / wallet bootstrap — no session cookie required. */
export function isDashboardAuthLoginPath(path: string, method: string): boolean {
  if (method === 'GET' && /^\/dashboard\/auth\/oauth\/[^/]+\/url$/.test(path)) return true;
  if (method === 'GET' && /^\/dashboard\/auth\/oauth\/[^/]+\/callback$/.test(path)) return true;
  if (path === '/dashboard/auth/wallet/nonce' && method === 'GET') return true;
  if (path === '/dashboard/auth/wallet/connect' && method === 'POST') return true;
  if (path === '/dashboard/auth/passkey/auth/status' && method === 'GET') return true;
  if (path === '/dashboard/auth/captcha/config' && method === 'GET') return true;
  if (path === '/dashboard/auth/passkey/auth/options' && method === 'POST') return true;
  if (path === '/dashboard/auth/passkey/auth/verify' && method === 'POST') return true;
  if (path === '/dashboard/auth/otp/request' && method === 'POST') return true;
  if (path === '/dashboard/auth/otp/verify' && method === 'POST') return true;
  if (path === '/dashboard/auth/totp/verify' && method === 'POST') return true;
  if (path === '/dashboard/auth/sms/verify-login' && method === 'POST') return true;
  if (path === '/dashboard/auth/backup-code/verify' && method === 'POST') return true;
  if (path === '/dashboard/auth/backup-code/recover' && method === 'POST') return true;
  return false;
}

/** Routes that skip dashboard session enforcement (webhooks, payment callbacks). */
export function isDashboardPublicPath(path: string, method: string): boolean {
  if (isDashboardAuthLoginPath(path, method)) return true;
  if (path === '/dashboard/vnpay/vnpay_return') return true;
  if (path === '/dashboard/vnpay/vnpay_ipn') return true;
  if (path === '/dashboard/vnpay/casso_ipn') return true;
  return false;
}
