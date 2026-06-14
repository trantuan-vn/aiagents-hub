import type { Context } from 'hono';

import { createTokenApplicationService } from '../../token/application.js';
import { ERROR_MESSAGES, TOKEN_CONSTANTS } from '../../token/constant.js';
import { securityUtils, tokenValidationUtils } from '../../token/utils.js';
import { WEBHOOK_TRIGGER_PERMISSION } from '../domain/constant.js';

export type ValidatedWebhookToken = {
  identifier: string;
  permissions: string[];
};

/**
 * Validate Bearer API token for a workflow webhook (same model as eKYC:
 * X-Client-ID = workflow owner DO id, Authorization: Bearer utk_…).
 */
export async function validateWebhookApiToken(
  c: Context,
  bindingName: string,
  ownerId: string,
): Promise<ValidatedWebhookToken> {
  const clientId = c.req.header('X-Client-ID') || c.req.query('client_id');
  if (!clientId) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_CLIENT_ID);
  }
  if (!tokenValidationUtils.isValidClientId(clientId)) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_CLIENT_ID);
  }
  if (clientId !== ownerId) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_CLIENT_ID);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    throw new Error(ERROR_MESSAGES.TOKEN.MISSING_AUTHORIZATION);
  }
  if (!tokenValidationUtils.isValidAuthHeader(authHeader)) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
  }

  const rawToken = authHeader.substring(7);
  if (!rawToken || rawToken.length > TOKEN_CONSTANTS.MAX_TOKEN_LENGTH) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
  }
  if (!tokenValidationUtils.isValidTokenFormat(rawToken)) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
  }

  const applicationService = createTokenApplicationService(c, bindingName);
  const validationPromise = applicationService.validateApiTokenUseCase(ownerId, rawToken);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(ERROR_MESSAGES.TOKEN.TOKEN_VALIDATION_TIMEOUT)), TOKEN_CONSTANTS.TOKEN_TIMEOUT_MS),
  );

  const validationResult = await Promise.race([validationPromise, timeoutPromise]);
  if (!validationResult.isValid || !validationResult.token) {
    throw new Error(validationResult.error || ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
  }

  const tokenData = securityUtils.sanitizeTokenData(validationResult.token);
  if (!tokenValidationUtils.isValidTokenStructure(tokenData)) {
    throw new Error(ERROR_MESSAGES.TOKEN.INVALID_TOKEN);
  }

  securityUtils.validatePermissions(tokenData, [WEBHOOK_TRIGGER_PERMISSION]);

  return {
    identifier: String(tokenData.identifier ?? ownerId),
    permissions: tokenData.permissions as string[],
  };
}
