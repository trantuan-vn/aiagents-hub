import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';  
import { handleError, parseBody, getIPAndUserAgent, generateSecureSessionId } from '../../shared/utils';
import { requireAuth } from './authMiddleware';
import { createApplicationService } from './application';
import { 
  OTPRequestSchema, 
  OTPVerificationSchema, 
  TotpVerifySchema,
  SmsVerifyLoginSchema,
  BackupCodeVerifySchema,
  BackupCodeRecoverSchema,
  OAuthCallbackSchema, 
  SIWEAuthSchema 
} from './domain';
// SIWEAuthSchema also used for DID link/unlink
import { cookieUtils, oauthUtils } from './utils';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createAccountPasskeyApplication, createPasskeyAuthApplication } from '../account/passkey';
import { createAccountBackupCodeApplication } from '../account/backup-codes';
import { createAccountEkycApplication } from '../account/ekyc';
import { createAccountDidApplication } from '../account/did';
import {
  VerifyAuthenticatorSchema,
  DisableAuthenticatorSchema,
  RequestSmsSchema,
  VerifySmsSchema,
  DisableSmsSchema,
} from '../account/domain';
import { createDocumentAIService } from '../member/ekyc/application';
import { EKYC_SERVICES } from '../member/ekyc/constant';
import { processFormData, processDocumentFormData, processFaceFormData, mergeImages, hashIdentifier, saveToEkycR2, getFromEkycR2 } from '../member/ekyc/utils';

export function createAuthRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // Helper function để xử lý route chung
  const createRouteHandler = (
    handler: Function, 
    errorMessage: string,
    requireOriginCheck: boolean = false
  ) => {
    return async (c: any) => {
      try {
        if (requireOriginCheck) {
          const origin = c.req.header('origin') || c.req.header('referer');
          console.log(`origin: ${origin}, frontend_url: ${c.env.FRONTEND_URL}`);
          if (!origin?.startsWith(c.env.FRONTEND_URL)) {
            throw new Error('Invalid origin');
          }
        }

        const request = c.req.raw;
        const { ipAddress, userAgent } = getIPAndUserAgent(request);
        if (!ipAddress || !userAgent) {
          throw new Error('Missing IP address or user agent');
        }
        const sessionId = cookieUtils.getOrCreatePreAuthSessionId(c);
        return await handler(c, sessionId, ipAddress, userAgent);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        cookieUtils.clearAuthCookies(c);
        return c.json(errorResponse, status);
      }
    };
  };

  // I. OAUTH Routes
  app.get('/oauth/:provider/url', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const provider = c.req.param('provider') as any;
    
    if (!['google', 'apple', 'facebook', 'github', 'twitter'].includes(provider)) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const applicationService = createApplicationService(c, bindingName);
    const authUrl = await applicationService.getAuthUrlUseCase(provider, sessionId);

    return c.json({ url: authUrl });
  }, "Failed to get OAuth URL"));

  app.get('/oauth/:provider/callback', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const provider = c.req.param('provider') as any;
    
    if (!['google', 'apple', 'facebook', 'github', 'twitter'].includes(provider)) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Check for OAuth errors
    const error = c.req.query('error');
    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }
    
    const queryParams = c.req.query();
    if (!queryParams.code || !queryParams.state) {
      throw new Error('Missing OAuth code or state');
    }
    const { code, state } = OAuthCallbackSchema.parse(c.req.query());

    if (!code || !state) {
      throw new Error('Missing OAuth code or state');
    }    

    const applicationService = createApplicationService(c, bindingName);

    // Exchange code for tokens and connect user (sessionId lấy từ state, không dùng cookie)
    const { userInfo: validatedUserInfo, sessionId: oauthSessionId } = await applicationService.exchangeOAuthCodeUseCase(provider, state, code);
    const identifier = oauthUtils.normalizeOAuthIdentifier(provider, validatedUserInfo);

    const result = await applicationService.connectOAuthUseCase(
      oauthSessionId, identifier, ipAddress, userAgent
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      // Đồng bộ cookie với sessionId từ state - redirect từ Google có thể không gửi cookie,
      // nên getOrCreatePreAuthSessionId đã tạo sessionId mới; PendingTotp dùng oauthSessionId.
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', oauthSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.redirect(`${c.env.FRONTEND_URL}/auth/v3/login?requiresTotp=1`);
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', oauthSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.redirect(`${c.env.FRONTEND_URL}/auth/v3/login?requiresSms=1`);
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.redirect(`${c.env.FRONTEND_URL}/dashboard`);
  }, "OAuth callback failed"));

  // II. OTP Routes
  app.post('/otp/request', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { identifier, language } = await parseBody(c, OTPRequestSchema);

    const applicationService = createApplicationService(c, bindingName);
    await applicationService.getRequestOtpUseCase(identifier, sessionId, language);

    return c.json({ ok: true });
  }, "OTP request failed"));

  app.post('/otp/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { identifier, otp } = await parseBody(c, OTPVerificationSchema);
    
    const applicationService = createApplicationService(c, bindingName);
    const result = await applicationService.verifyOtpUseCase(
      identifier, sessionId, otp, ipAddress, userAgent
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresTotp: true });
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresSms: true });
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "OTP verification failed"));

  app.post('/totp/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { code } = await parseBody(c, TotpVerifySchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifyTotpLoginUseCase(
      sessionId, code, ipAddress, userAgent
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "TOTP verification failed"));

  app.post('/sms/verify-login', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { code } = await parseBody(c, SmsVerifyLoginSchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifySmsLoginUseCase(
      sessionId, code, ipAddress, userAgent
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "SMS verification failed"));

  app.post('/backup-code/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { code } = await parseBody(c, BackupCodeVerifySchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifyBackupCodeLoginUseCase(
      sessionId, code, ipAddress, userAgent
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Backup code verification failed"));

  app.post('/backup-code/recover', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { identifier, code } = await parseBody(c, BackupCodeRecoverSchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.recoverWithBackupCodeUseCase(
      identifier, code, sessionId, ipAddress, userAgent
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Backup code recovery failed"));

  // IIb. Passkey Auth (login) – public, no auth required
  const getPasskeyAuthApp = (ctx: any) =>
    createPasskeyAuthApplication(ctx, bindingName, {
      rpName: 'Unitoken',
      getOrigin: () => ctx.req.header('origin') || ctx.env.FRONTEND_URL || '',
    });

  app.get('/passkey/auth/status', createRouteHandler(async (c: any) => {
    const identifier = c.req.query('identifier');
    if (!identifier || typeof identifier !== 'string') {
      return c.json({ enabled: false, credentialCount: 0 });
    }
    const appService = getPasskeyAuthApp(c);
    const status = await appService.getPasskeyAuthStatusUseCase(identifier.trim());
    return c.json(status);
  }, "Passkey status failed"));

  app.post('/passkey/auth/options', createRouteHandler(async (c: any) => {
    const origin = c.req.header('origin') || c.env.FRONTEND_URL;
    if (!origin) throw new Error('Origin required');
    const body = (await c.req.json().catch(() => ({}))) as { identifier?: string };
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() || undefined : undefined;
    const appService = getPasskeyAuthApp(c);
    const result = await appService.getAuthenticationOptionsUseCase(identifier, origin);
    return c.json(result);
  }, "Passkey auth options failed", true));

  app.post('/passkey/auth/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const origin = c.req.header('origin') || c.env.FRONTEND_URL;
    if (!origin) throw new Error('Origin required');
    const body = (await c.req.json()) as { response: unknown; identifier?: string; challengeKey?: string };
    if (!body?.response || !body?.challengeKey) throw new Error('response and challengeKey required');
    const appService = getPasskeyAuthApp(c);
    const applicationService = createApplicationService(c, bindingName);
    const { identifier } = await appService.verifyAuthenticationUseCase(
      body.response,
      typeof body.identifier === 'string' ? body.identifier.trim() || undefined : undefined,
      body.challengeKey,
      origin
    );
    const { sessionId: newSessionId } = await applicationService.connectPasskeyUseCase(
      sessionId, identifier, ipAddress, userAgent
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Passkey auth verify failed", true));

  // III. Wallet Routes
  app.get('/wallet/nonce', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const applicationService = createApplicationService(c, bindingName);
    const nonce = await applicationService.generateNonceUseCase(sessionId);

    return c.json({ nonce });
  }, "Nonce request failed"));

  app.post('/wallet/connect', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const { message, signature } = await parseBody(c, SIWEAuthSchema);

    const applicationService = createApplicationService(c, bindingName);
    const fields = await applicationService.verifySignatureUseCase(sessionId, message, signature);
    const address = fields.address.toLowerCase();

    const result = await applicationService.connectWalletUseCase(
      sessionId, address, ipAddress, userAgent
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      // Đồng bộ cookie để totp/verify dùng đúng sessionId (phòng popup/iframe có cookie khác)
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresTotp: true });
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresSms: true });
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Wallet connection failed"));

  // IV. Profile Routes
  app.post('/profile/logout', async (c) => {
    try {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) throw new Error('Session not found');
      
      const user = requireAuth(c);
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.logoutUseCase(user.identifier, sessionId);
      
      cookieUtils.clearAuthCookies(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Logout failed");
      return c.json(errorResponse, 401);
    }
  });

  app.post('/profile/logoutAll', async (c) => {
    try {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) throw new Error('Session not found');
      
      const user = requireAuth(c);
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.logoutAllUseCase(user.identifier);
      
      cookieUtils.clearAuthCookies(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Logout failed");
      return c.json(errorResponse, 401);
    }
  });

  app.get('/profile/me', async (c) => {
    try {
      const user = requireAuth(c);
      return c.json({ 
        id: user.id, 
        identifier: user.identifier, 
        address: user.address,
        role: user.role || 'member'
      });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Get user info failed");
      return c.json(errorResponse, 401);
    }
  });

  // V. Session management (list & revoke)
  app.get('/sessions', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = getCookie(c, 'sessionId');
      const applicationService = createApplicationService(c, bindingName);
      const result = await applicationService.listSessionsUseCase(user.identifier, sessionId ?? undefined);
      return c.json(result.sessions);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list sessions');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sessions/:sessionId/revoke', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = c.req.param('sessionId');
      if (!sessionId) throw new Error('Session ID required');
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.revokeSessionUseCase(user.identifier, sessionId);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to revoke session');
      return c.json(errorResponse, status);
    }
  });

  // VI. Authenticator (TOTP) – requires auth
  app.get('/authenticator/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      const status = await appService.getAuthenticatorStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get authenticator status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/setup', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json().catch(() => ({}));
      const issuer = typeof body.issuer === 'string' ? body.issuer : 'Unitoken';
      const accountName = typeof body.accountName === 'string' ? body.accountName : user.identifier;
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      const result = await appService.setupAuthenticatorUseCase(user.identifier, issuer, accountName);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to setup authenticator');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, VerifyAuthenticatorSchema);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      await appService.verifyAuthenticatorUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify authenticator');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/disable', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, DisableAuthenticatorSchema);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      await appService.disableAuthenticatorUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to disable authenticator');
      return c.json(errorResponse, status);
    }
  });

  // VII. SMS 2FA – requires auth
  app.get('/sms/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = createAccountSmsApplication(c, bindingName);
      const status = await appService.getSmsStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get SMS status');
      return c.json(errorResponse, status);
    }
  });
 
  app.post('/sms/request', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, RequestSmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.requestSmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to request SMS code');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sms/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, VerifySmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.verifySmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify SMS code');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sms/disable', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, DisableSmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.disableSmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to disable SMS');
      return c.json(errorResponse, status);
    }
  });

  // VIII. Passkey (WebAuthn) – requires auth, origin check for security
  const getPasskeyApp = (ctx: any) =>
    createAccountPasskeyApplication(ctx, bindingName, {
      rpName: 'Unitoken',
      getOrigin: () => ctx.req.header('origin') || ctx.env.FRONTEND_URL || '',
    });

  app.get('/passkey/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getPasskeyApp(c);
      const status = await appService.getPasskeyStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get passkey status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/passkey/registration/options', async (c) => {
    try {
      const user = requireAuth(c);
      const origin = c.req.header('origin') || c.env.FRONTEND_URL;
      if (!origin) throw new Error('Origin required');
      const body = await c.req.json().catch(() => ({}));
      const userName = typeof body.userName === 'string' ? body.userName : user.identifier;
      const appService = getPasskeyApp(c);
      const result = await appService.getRegistrationOptionsUseCase(user.identifier, userName, origin);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get passkey registration options');
      return c.json(errorResponse, status);
    }
  });

  app.post('/passkey/registration/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const origin = c.req.header('origin') || c.env.FRONTEND_URL;
      if (!origin) throw new Error('Origin required');
      const body = await c.req.json() as { response: unknown; challengeKey?: string };
      if (!body?.response || !body?.challengeKey) throw new Error('response and challengeKey required');
      const appService = getPasskeyApp(c);
      await appService.verifyRegistrationUseCase(
        user.identifier,
        { response: body.response as any, challengeKey: body.challengeKey },
        origin
      );
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify passkey registration');
      return c.json(errorResponse, status);
    }
  });

  app.get('/passkey/credentials', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getPasskeyApp(c);
      const list = await appService.listCredentialsUseCase(user.identifier);
      return c.json(list);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list passkey credentials');
      return c.json(errorResponse, status);
    }
  });

  app.delete('/passkey/credentials/:credentialId', async (c) => {
    try {
      const user = requireAuth(c);
      const credentialId = c.req.param('credentialId');
      if (!credentialId) throw new Error('credentialId required');
      const appService = getPasskeyApp(c);
      await appService.removeCredentialUseCase(user.identifier, credentialId);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to remove passkey');
      return c.json(errorResponse, status);
    }
  });

  // IX. Backup codes – status, generate, regenerate (replace existing)
  const getBackupCodesApp = (ctx: any) => createAccountBackupCodeApplication(ctx, bindingName);

  app.get('/backup-codes/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getBackupCodesApp(c);
      const status = await appService.getStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get backup codes status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/backup-codes/generate', async (c) => {
    try {
      const user = requireAuth(c);
      const body = (await c.req.json().catch(() => ({}))) as { replaceExisting?: boolean };
      const replaceExisting = Boolean(body.replaceExisting);
      const appService = getBackupCodesApp(c);
      const result = await appService.generateUseCase(user.identifier, replaceExisting);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to generate backup codes');
      return c.json(errorResponse, status);
    }
  });

  // X. eKYC – identity verification (dashboard auth, no API token)
  const getEkycApp = (ctx: any) => createAccountEkycApplication(ctx, bindingName);
  const getEkycAI = (ctx: any) => createDocumentAIService(ctx, bindingName);

  app.get('/ekyc/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getEkycApp(c);
      const status = await appService.getStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get eKYC status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/remove', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getEkycApp(c);
      await appService.resetUseCase(user.identifier);
      return c.json({ success: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to remove eKYC');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/recognize-document', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { docType, images } = await processDocumentFormData(c);
      const aiService = getEkycAI(c);
      const ekycApp = getEkycApp(c);
      const userPrefix = await hashIdentifier(user.identifier);

      const docTypes = docType === 'passport' ? ['passport'] : ['cccd_front', 'cccd_back'];
      const extractedParts: Record<string, unknown>[] = [];
      const r2Keys: { front: string; back?: string } = { front: '' };

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dt = docTypes[i];
        const result = await aiService.recognizeDocumentUseCase(user.identifier, {
          endpoint: EKYC_SERVICES.DOCUMENT.RECOGNIZE.path,
          image: img,
          docType: dt,
          ipAddress,
          userAgent,
        });
        extractedParts.push(result.extractedData);

        const suffix = docType === 'passport' ? 'passport.jpg' : dt === 'cccd_front' ? 'front.jpg' : 'back.jpg';
        const key = await saveToEkycR2(c.env as any, userPrefix, `doc-${suffix}`, img);
        if (i === 0) r2Keys.front = key;
        else (r2Keys as any).back = key;
      }

      const mergedData = Object.assign({}, ...extractedParts);
      const avgConfidence = extractedParts.length > 0
        ? extractedParts.reduce((sum, p) => sum + (Number((p as any)?.confidence_score) || 0.7), 0) / extractedParts.length
        : 0.7;

      await ekycApp.saveDocumentDataUseCase(user.identifier, {
        docType,
        docExtractedData: JSON.stringify(mergedData),
        docFrontKey: r2Keys.front,
        docBackKey: r2Keys.back,
      });
      if (avgConfidence >= 0.7) {
        await ekycApp.setDocumentVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setDocumentSubmittedUseCase(user.identifier);
      }

      return c.json({
        documentType: docType,
        extractedData: mergedData,
        confidence: avgConfidence,
        processingTime: Date.now(),
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Document recognition failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-search', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image } = await processFormData(c);
      const aiService = getEkycAI(c);
      const result = await aiService.faceSearchUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.SEARCH.path,
        image,
        ipAddress,
        userAgent,
      });
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face search failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-verify', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image, image2 } = await processFormData(c);
      if (!image2) throw new Error('Missing second image for verification');

      let docImage: File;
      if (image) {
        docImage = image;
      } else {
        const ekycApp = getEkycApp(c);
        const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
        if (!docFrontKey) throw new Error('No document on file. Complete document step first.');
        const buf = await getFromEkycR2(c.env as any, docFrontKey);
        if (!buf) throw new Error('Document image not found');
        docImage = new File([buf], 'doc.jpg', { type: 'image/jpeg' });
      }

      const mergedImage = await mergeImages(docImage, image2, c.env as any);
      const aiService = getEkycAI(c);
      const result = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });
      const ekycApp = getEkycApp(c);
      if (result.isMatch && result.confidence >= 0.75) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face verification failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-verify-test', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image } = await processFormData(c);
      if (!image) throw new Error('Missing selfie image for verification test');

      const ekycApp = getEkycApp(c);
      const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
      if (!docFrontKey) throw new Error('No document on file. Complete eKYC first.');

      const buf = await getFromEkycR2(c.env as any, docFrontKey);
      if (!buf) throw new Error('Document image not found');
      const docImage = new File([buf], 'doc.jpg', { type: 'image/jpeg' });

      const mergedImage = await mergeImages(docImage, image, c.env as any);
      const aiService = getEkycAI(c);
      const result = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face verification test failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-submit', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const faceData = await processFaceFormData(c);
      const ekycApp = getEkycApp(c);
      const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
      if (!docFrontKey) throw new Error('Complete document step first');

      const firstFrame = faceData.type === 'video' ? faceData.frame : faceData.type === 'images' ? faceData.files[0] : faceData.file;
      const aiService = getEkycAI(c);

      const livenessResult = await aiService.livenessDetectionUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.LIVENESS.path,
        image: firstFrame,
        isVideo: faceData.type === 'video',
        ipAddress,
        userAgent,
      });
      if (!livenessResult.isLive || livenessResult.confidence < 0.7) {
        return c.json({ error: 'Liveness check failed', ...livenessResult }, 400);
      }

      const userPrefix = await hashIdentifier(user.identifier);
      let faceMediaKey: string;
      if (faceData.type === 'video') {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face-clip.webm', faceData.file);
      } else if (faceData.type === 'images') {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face-1.jpg', firstFrame);
        for (let i = 1; i < faceData.files.length; i++) {
          await saveToEkycR2(c.env as any, userPrefix, `face-${i + 1}.jpg`, faceData.files[i]);
        }
      } else {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face.jpg', faceData.file);
      }

      await ekycApp.saveFaceMediaKeyUseCase(user.identifier, faceMediaKey);

      const docBuf = await getFromEkycR2(c.env as any, docFrontKey);
      if (!docBuf) throw new Error('Document image not found');
      const docImage = new File([docBuf], 'doc.jpg', { type: 'image/jpeg' });
      const mergedImage = await mergeImages(docImage, firstFrame, c.env as any);

      const verifyResult = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });

      if (verifyResult.isMatch && verifyResult.confidence >= 0.75) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }

      return c.json({ ...verifyResult, liveness: livenessResult });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face submit failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-liveness', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image, isVideo } = await processFormData(c);
      const aiService = getEkycAI(c);
      const result = await aiService.livenessDetectionUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.LIVENESS.path,
        image,
        isVideo,
        ipAddress,
        userAgent,
      });
      const ekycApp = getEkycApp(c);
      if (result.isLive && result.confidence >= 0.7) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Liveness detection failed');
      return c.json(errorResponse, status);
    }
  });

  // XI. DID (Decentralized Identity) – did:ethr for EVM wallet
  const getDidApp = (ctx: any) => createAccountDidApplication(ctx, bindingName);

  app.get('/did/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getDidApp(c);
      const status = await appService.getDidStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID status');
      return c.json(errorResponse, status);
    }
  });

  app.get('/did/nonce', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = generateSecureSessionId();
      cookieUtils.setDidChallengeId(c, sessionId);
      const appService = getDidApp(c);
      const nonce = await appService.getDidNonceUseCase(sessionId);
      return c.json({ nonce });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID nonce');
      return c.json(errorResponse, status);
    }
  });

  app.post('/did/link', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = cookieUtils.getDidChallengeId(c);
      if (!sessionId) throw new Error('DID challenge not found. Call /did/nonce first.');
      const { message, signature } = await parseBody(c, SIWEAuthSchema);
      const appService = getDidApp(c);
      const result = await appService.linkDidUseCase(user.identifier, sessionId, message, signature);
      cookieUtils.clearDidChallengeId(c);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to link DID');
      return c.json(errorResponse, status);
    }
  });

  app.get('/did/unlink/nonce', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = generateSecureSessionId();
      cookieUtils.setDidChallengeId(c, sessionId);
      const appService = getDidApp(c);
      const nonce = await appService.getDidUnlinkNonceUseCase(sessionId);
      return c.json({ nonce });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID unlink nonce');
      return c.json(errorResponse, status);
    }
  });

  app.post('/did/unlink', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = cookieUtils.getDidChallengeId(c);
      if (!sessionId) throw new Error('DID challenge not found. Call /did/unlink/nonce first.');
      const { message, signature } = await parseBody(c, SIWEAuthSchema);
      const appService = getDidApp(c);
      await appService.unlinkDidUseCase(user.identifier, sessionId, message, signature);
      cookieUtils.clearDidChallengeId(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to unlink DID');
      return c.json(errorResponse, status);
    }
  });

  return app;
}