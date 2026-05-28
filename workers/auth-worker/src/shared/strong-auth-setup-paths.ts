/** API được phép khi account có số dư nhưng chưa bật TOTP / SMS 2FA / passkey. */
const REVERIFY_ALLOWED: Array<{ methods?: string[]; pattern: RegExp }> = [
  // Allowed to keep user informed + allow leaving the account.
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/profile\/me$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/profile\/logout$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/profile\/logoutAll$/ },

  // Allowed 2FA status endpoints (read-only).
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/authenticator\/status$/ },
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/sms\/status$/ },
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/passkey\/status$/ },
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/backup-codes\/status$/ },

  // Re-verify unlock: OTP email/SMS verify.
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/otp\/request$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/otp\/verify$/ },

  // Optional: client may need siteKey for captcha when server requires Turnstile.
  { methods: ['GET'], pattern: /^\/dashboard\/auth\/captcha\/config$/ },
];

const SETUP_ALLOWED: Array<{ methods?: string[]; pattern: RegExp }> = [
  ...REVERIFY_ALLOWED,
  // Step-up challenge flow (required before sensitive setup actions).
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/step-up\/request$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/step-up\/verify$/ },
  // Enable/setup endpoints (state-changing).
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/authenticator\/setup$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/authenticator\/verify$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/sms\/request$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/sms\/verify$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/passkey\/registration\/options$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/passkey\/registration\/verify$/ },
  { methods: ['POST'], pattern: /^\/dashboard\/auth\/backup-codes\/generate$/ },
];

function isAllowedPath(
  allowed: Array<{ methods?: string[]; pattern: RegExp }>,
  path: string,
  method: string,
): boolean {
  if (method === 'OPTIONS') return true;
  const upper = method.toUpperCase();
  return allowed.some(({ methods, pattern }) => {
    if (methods && !methods.includes(upper)) return false;
    return pattern.test(path);
  });
}

export function isStrongAuthReverifyAllowedPath(path: string, method: string): boolean {
  return isAllowedPath(REVERIFY_ALLOWED, path, method);
}

export function isStrongAuthSetupAllowedPath(path: string, method: string): boolean {
  return isAllowedPath(SETUP_ALLOWED, path, method);
}
