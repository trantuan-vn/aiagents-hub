import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { ERROR_MESSAGES as AUTH_ERRORS } from '../features/auth/constant';
import { ERROR_MESSAGES as TOKEN_ERRORS } from '../features/member/token/constant';
import { PAYMENT_ERROR_MESSAGES } from '../features/member/vnpay/constant';
import type { Logger } from './logger';

const SAFE_CLIENT_MESSAGES = new Set<string>([
  ...Object.values(AUTH_ERRORS.AUTH),
  ...Object.values(TOKEN_ERRORS.TOKEN),
]);

/** Deliberate user-facing / validation failures — log as warn, not error. */
const OPERATIONAL_MESSAGES = new Set<string>([
  ...Object.values(PAYMENT_ERROR_MESSAGES),
  'sessionId not found',
  'Session not found',
  'Session ID required',
  'Device mismatch for passkey',
  'User not found',
  'Invalid identifier',
  'Invalid user identifier',
  'Challenge expired or invalid',
  'Passkey verification failed',
  'Invalid passkey response',
  'Could not identify user from passkey',
  'Passkey not found',
  'Authenticator is already enabled',
  'Authenticator is not enabled',
  'Invalid verification code',
  'SMS is already enabled',
  'SMS is not enabled',
  'Invalid phone number',
  'DID is already linked to this account',
  'Invalid address',
  'Insufficient wallet balance',
  'User profile not found',
  'Order not found',
  'Workflow not found',
  'Shared workflow not found',
  'Workflow is not published',
  'Workflow not found for trigger',
  'Prompt is required',
  'Workflow has no Agent node. Add an Agent node to enable chat.',
  'Agent node is missing serviceEndpoint',
  'Voucher code already exists',
  'Voucher not found',
  'Only pending services can be approved',
  'Amount supports at most 2 decimal places',
  'Missing OAuth code or state',
  'Facebook step-up session expired',
  'Facebook account mismatch for step-up',
  'OTP verification is unavailable for this account',
  'TOTP not enabled',
  'TOTP not configured',
  'SMS second factor is not available',
  'SMS phone is unavailable',
  'SMS verification session expired',
  'Continue with Facebook to verify this step-up method',
  'response and challengeKey required',
  'credentialId required',
  'Origin required',
  'message and signature required',
  'Missing IP or user agent',
  'Missing IP address or user agent',
  'Missing second image for verification',
  'Missing selfie image for verification test',
  'No document on file. Complete document step first.',
  'No document on file. Complete eKYC first.',
  'Document image not found',
  'Sensitive action requires step-up verification',
  'Step-up method not available',
  'Step-up verification is unavailable',
]);

const OPERATIONAL_MESSAGE_PREFIXES = [
  'Service not found for endpoint:',
  'Service is not approved yet:',
  'Amount must be at least',
  'Voucher for ',
  'AI could not produce a valid workflow (',
] as const;

/** Missing config, bindings, or internal invariant — always log as error. */
const INFRA_ERROR_SUBSTRINGS = [
  ' is not defined in environment variables',
  ' binding not configured',
  'Durable Object binding',
  ' not registered',
  'AI binding is not configured',
  'getNextId function is required',
  'SYSTEM_CONFIG_KV not configured',
] as const;

type ErrorEnv = Pick<Env, 'DEBUG' | 'ENVIRONMENT'>;

export function isSafeClientMessage(message: string): boolean {
  return SAFE_CLIENT_MESSAGES.has(message);
}

function isInfraError(message: string): boolean {
  return INFRA_ERROR_SUBSTRINGS.some((s) => message.includes(s));
}

function isOperationalMessage(message: string): boolean {
  if (isInfraError(message)) return false;
  if (isSafeClientMessage(message)) return true;
  if (OPERATIONAL_MESSAGES.has(message)) return true;
  return OPERATIONAL_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix));
}

function resolveOperationalHttpStatus(message: string): ContentfulStatusCode {
  const auth = AUTH_ERRORS.AUTH;

  if (
    message === 'sessionId not found' ||
    message === 'Session ID required' ||
    message === 'Challenge expired or invalid' ||
    message === 'Passkey not found' ||
    message === 'Could not identify user from passkey' ||
    message === 'Passkey verification failed' ||
    message === 'Missing OAuth code or state' ||
    message === 'Facebook step-up session expired' ||
    message === auth.SESSION_NOT_FOUND ||
    message === auth.SESSION_EXPIRED
  ) {
    return 401;
  }

  if (
    message === 'Device mismatch for passkey' ||
    message === 'Facebook account mismatch for step-up' ||
    message === 'Sensitive action requires step-up verification' ||
    message === 'Insufficient wallet balance' ||
    message === 'Insufficient permissions' ||
    message.includes('not enabled') ||
    message.includes('not available') ||
    message.includes('mismatch')
  ) {
    return 403;
  }

  if (message.includes('not found') || message === 'User not found') {
    return 404;
  }

  return 400;
}

/** Controlled failures (auth, validation, business rules) vs unexpected bugs. */
export function isExpectedOperationalError(e: unknown, status: ContentfulStatusCode): boolean {
  if (status < 500) return true;

  const message = extractErrorMessage(e);
  if (isInfraError(message)) return false;
  if (e instanceof ZodError) return true;
  return isOperationalMessage(message);
}

export function logHandlerFailure(
  log: Logger,
  event: 'handler.request_error' | 'handler.error',
  e: unknown,
  ctx: Record<string, unknown>,
): void {
  const message = extractErrorMessage(e);
  const safe = isSafeClientMessage(message);
  const status = resolveHttpStatus(message, safe, e);

  if (isExpectedOperationalError(e, status)) {
    log.warn(event, ctx);
  } else {
    log.error(event, ctx);
  }
}

export function resolveHttpStatus(
  message: string,
  isSafe: boolean,
  e?: unknown,
): ContentfulStatusCode {
  if (e instanceof ZodError) return 400;
  if (!isSafe) {
    if (isOperationalMessage(message)) return resolveOperationalHttpStatus(message);
    return 500;
  }

  const auth = AUTH_ERRORS.AUTH;
  if (
    message === auth.NOT_AUTHENTICATED ||
    message === auth.SESSION_NOT_FOUND ||
    message === auth.SESSION_EXPIRED ||
    message === auth.INVALID_TOKEN ||
    message === auth.INVALID_REFRESH_TOKEN ||
    message === auth.INVALID_CREDENTIALS
  ) {
    return 401;
  }
  if (message === auth.NOT_AUTHORIZED || message === auth.STRONG_AUTH_REQUIRED) return 403;
  if (message === auth.RATE_LIMIT_EXCEEDED) return 429;
  if (message === auth.CAPTCHA_REQUIRED || message === auth.INVALID_CAPTCHA) return 400;

  const token = TOKEN_ERRORS.TOKEN;
  if (
    message === token.MISSING_AUTHORIZATION ||
    message === token.INVALID_TOKEN ||
    message === token.TOKEN_EXPIRED ||
    message === token.TOKEN_NOT_FOUND ||
    message === token.INVALID_CLIENT_ID
  ) {
    return 401;
  }
  if (message === token.INSUFFICIENT_PERMISSIONS) return 403;
  if (message === token.RATE_LIMIT_EXCEEDED) return 429;

  return 400;
}

export function resolveClientErrorMessage(
  defaultMessage: string,
  internalMessage: string,
  env?: ErrorEnv,
): string {
  const debug = String(env?.DEBUG ?? '') === 'true';
  const isProd = env?.ENVIRONMENT === 'production';

  if (internalMessage && isOperationalMessage(internalMessage)) {
    return internalMessage;
  }
  if (debug || !isProd) {
    return internalMessage ? `${defaultMessage}: ${internalMessage}` : defaultMessage;
  }
  return defaultMessage;
}

export function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function buildErrorLogFields(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) {
    return { message: String(e) };
  }
  const anyErr = e as Error & {
    cause?: unknown;
    response?: { status?: number; statusText?: string; data?: unknown };
  };
  return {
    name: anyErr.name,
    message: anyErr.message,
    stack: anyErr.stack,
    cause: anyErr.cause,
    ...(anyErr.response
      ? {
          httpStatus: anyErr.response.status,
          httpStatusText: anyErr.response.statusText,
          responseData: anyErr.response.data,
        }
      : {}),
  };
}
