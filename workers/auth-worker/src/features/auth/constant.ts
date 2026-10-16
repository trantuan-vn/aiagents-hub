// Error Messages
export const ERROR_MESSAGES = {
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid credentials',
    INVALID_OTP: 'Invalid or expired OTP. Please ensure your device time is correct and try again.',
    TOTP_SESSION_EXPIRED: 'TOTP verification session expired. Please log in again.',
    SMS_SESSION_EXPIRED: 'SMS verification session expired. Please log in again.',
    TWO_FA_SESSION_EXPIRED: 'Verification session expired. Please log in again.',
    INVALID_TOKEN: 'Invalid token',
    INVALID_REFRESH_TOKEN: 'Invalid refresh token',
    SESSION_EXPIRED: 'Session expired',
    NOT_AUTHENTICATED: 'Not authenticated',
    NOT_AUTHORIZED: 'Not authorized',
    RATE_LIMIT_EXCEEDED: 'Too many requests',
    USER_NOT_FOUND: 'User not found',
    OAUTH_FAILED: 'OAuth authentication failed',
    OAUTH_STATE_INVALID: 'OAuth session expired or invalid. Please try again.',
    WALLET_CONNECTION_FAILED: 'Wallet connection failed',
    SESSION_NOT_FOUND: 'Session not found',
    CAPTCHA_REQUIRED: 'Captcha verification required',
    INVALID_CAPTCHA: 'Captcha verification failed. Please try again.',
    STRONG_AUTH_REQUIRED:
      'This account has a balance. Enable authenticator, SMS 2FA, or passkey in account security settings to continue.',
  }
} as const;

/** Chống enumeration trên GET passkey/auth/status */
export const PASSKEY_STATUS_MIN_RESPONSE_MS = 300;

// Authentication Constants
export const AUTH_CONSTANTS = {
  RESERVED_PREFIX: "__",
  RATE_LIMIT_MAX: 5,
  RATE_LIMIT_WINDOW: 60_000, // 1 minute
  ACCESS_TOKEN_EXPIRY: 15 * 60, // 15 minutes
  REFRESH_TOKEN_EXPIRY: 4 * 60 * 60, // 4 hours
  SESSION_EXPIRY: 4 * 60 * 60, // 4 hours
  /** OTP email/SMS login code lifetime. Resend reuses this code until it expires. */
  OTP_EXPIRY: 3 * 60,
  OTP_VERIFY_MAX_ATTEMPTS: 5,
  /** SMS OTP for /step-up when method is sms */
  STEP_UP_SMS_OTP_TTL_SEC: 300,
  STEP_UP_VERIFY_MAX_ATTEMPTS: 5,
  OTP_REQUEST_COOLDOWN_SEC: 60,
  OTP_REQUEST_MAX_PER_IDENTIFIER_HOUR: 10,
  OTP_REQUEST_MAX_PER_IP_HOUR: 30,
  /** Cross-session OTP verify failures per identifier before ops alert */
  OTP_IDENTIFIER_VERIFY_FAIL_ALERT: 20,
  /** Block OTP request for identifier after this many verify failures / hour */
  OTP_IDENTIFIER_VERIFY_FAIL_BLOCK: 30,
  /** Require Turnstile on OTP request after this many cross-session verify failures */
  OTP_CAPTCHA_REQUIRED_AFTER_IDENTIFIER_FAILS: 5,
  /** Require Turnstile after this many OTP requests for same identifier in one hour */
  OTP_REQUEST_CAPTCHA_AFTER_HOURLY: 3,
  /** After a successful Turnstile verify, skip re-challenge for this scope+session (seconds) */
  CAPTCHA_SATISFIED_TTL_SEC: 30 * 60,
  /** Clear captcha satisfaction after this many OTP/step-up verify failures in one session */
  CAPTCHA_CLEAR_AFTER_OTP_VERIFY_FAILS: 2,
  /** Backup code recovery (account takeover surface) */
  BACKUP_CODE_RECOVER_MAX_ATTEMPTS: 5,
  BACKUP_CODE_RECOVER_MAX_PER_IDENTIFIER_HOUR: 10,
  /** Wallet SIWE / DID challenge nonce */
  NONCE_EXPIRY: 5 * 60, // 5 minutes
  /**
   * Khóa chống gửi dồn `NewSessionEmailBurst` khi hai request song song ghi nhận cùng thiết bị
   * trước khi KV kịp ghi. Không phải trí nhớ thiết bị.
   */
  NEW_SESSION_EMAIL_COOLDOWN_SEC: 12 * 60 * 60, // 12 hours
  /** `lastSeenAt` cũ hơn mốc này thì lần đăng nhập sau được coi là thiết bị mới. */
  RECOGNIZED_DEVICE_IDLE_SEC: 30 * 24 * 60 * 60,
  /** Hết hạn thì step-up lại, dù mail vẫn im nếu `lastSeenAt` còn trong 30 ngày. */
  STEP_UP_REMEMBER_SEC: 30 * 24 * 60 * 60,
} as const;

/** UUID thiết bị client (v4 và các biến thể RFC). */
export const CLIENT_DEVICE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;