import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ERROR_MESSAGES as AUTH_ERRORS } from '../features/auth/constant';
import { ERROR_MESSAGES as TOKEN_ERRORS } from '../features/member/token/constant';

const SAFE_CLIENT_MESSAGES = new Set<string>([
  ...Object.values(AUTH_ERRORS.AUTH),
  ...Object.values(TOKEN_ERRORS.TOKEN),
]);

type ErrorEnv = Pick<Env, 'DEBUG' | 'ENVIRONMENT'>;

export function isSafeClientMessage(message: string): boolean {
  return SAFE_CLIENT_MESSAGES.has(message);
}

export function resolveHttpStatus(message: string, isSafe: boolean): ContentfulStatusCode {
  if (!isSafe) return 500;

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
  if (message === auth.NOT_AUTHORIZED) return 403;
  if (message === auth.RATE_LIMIT_EXCEEDED) return 429;

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

  if (internalMessage && isSafeClientMessage(internalMessage)) {
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
