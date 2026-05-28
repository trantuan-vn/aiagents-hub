import { UserDO } from '../ws/infrastructure/UserDO';
import { SiweMessage, generateNonce } from 'siwe';

import { 
  UserSchema, 
  IUserRepository, 
  IOTPService, 
  IWalletService, 
  IOAuthService, 
  IKvService,
  OAuthTokenResponse,
  OAuthTokenResponseSchema,
  GoogleUserInfoSchema, 
  AppleUserInfoSchema, 
  FacebookUserInfoSchema, 
  GitHubUserInfoSchema, 
  TwitterUserInfoSchema,
  Session, 
  SessionSchema, 
  ISessionRepository
} from './domain';
import { AUTH_CONSTANTS, ERROR_MESSAGES } from './constant';
import {
  checkOtpVerifyBlocked,
  clearOtpVerifyAttempts,
  OtpRateLimitError,
  recordOtpVerifyFailure,
} from '../../shared/otp-rate-limit';
import { oauthUtils, otpUtils, validationUtils } from './utils';
import {
  hashPendingLoginOtp,
  verifyPendingLoginOtp,
  type PendingLoginOtpRecord,
} from './pending-login-otp';
import { encodeOAuthState, decodeOAuthState } from '../../shared/oauth-state';
import { consumeSessionNonce, storeSessionNonce } from '../../shared/kv-nonce';

import { executeUtils } from '../../shared/utils';

async function requireEncryptionSecret(env: Env): Promise<string> {
  const secret = await env.ENCRYPTION_SECRET.get();
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
  }
  return secret;
}

// User Repository Implementation
const createUserRepository = (userDO: DurableObjectStub<UserDO>): IUserRepository => ({
  async get(): Promise<any> {
    const user = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users')
    return user[0] || null;
  },

  async save(user: any): Promise<any> {
    const validationResult = UserSchema.parse(user);
    const existingUser = await this.get();
    
    const operation = existingUser ? 'update' : 'insert';
    const payload = existingUser? {
                                    ...validationResult,
                                    id: existingUser.id
                                  }
                                : validationResult
    
    return await executeUtils.executeDynamicAction(userDO, operation, payload, 'users');
  },

  async delete(): Promise<void> {
    const user = await this.get();
    if (!user) return;

    await executeUtils.executeDynamicAction(userDO, 'delete', { id: user.id }, 'users');
  },
});

// Session Repository Implementation
const createSessionRepository = (userDO: DurableObjectStub<UserDO>): ISessionRepository => ({
  async create(sessionData: Session): Promise<any> {
    const validSession = SessionSchema.parse(sessionData);
    return await executeUtils.executeDynamicAction(userDO, 'upsert', validSession, 'sessions');
  },

  async findById(sessionId: string): Promise<any> {
    const session = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: [
          { field: "hashSessionId", operator: '=', value: sessionId },
          { field: "isActive", operator: '=', value: 1 }
        ]
      }, 'sessions')    
    return session[0] || null;
  },

  async existsByHashSessionId(sessionId: string): Promise<boolean> {
    const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [
        { field: 'hashSessionId', operator: '=', value: sessionId },
        { field: 'isActive', operator: '=', value: 1 },
      ],
      limit: 1,
    }, 'sessions');
    return Array.isArray(rows) && rows.length > 0;
  },

  async listAll(limit = 50): Promise<Session[]> {
    const sessions = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [{ field: 'isActive', operator: '=', value: 1 }],
      orderBy: { field: 'id', direction: 'DESC' },
      limit,
    }, 'sessions');
    return Array.isArray(sessions) ? sessions : [];
  },

  async update(sessionId: string, sessionData: Partial<Session>): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
    }    
    const updatedData = {
      id: session.id,
      ...sessionData
    };
    await executeUtils.executeDynamicAction(userDO, 'update', updatedData, 'sessions');

  },

  async delete(sessionId: string): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
    }    
    await executeUtils.executeDynamicAction(userDO, 'delete', { id: session.id }, 'sessions');
  },

  async deactivateAllUserSessions(identifier: string): Promise<string[]> {
    const sessions = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: [{ field: 'isActive', operator: '=', value: 1 }],
      limit: 500
    }, 'sessions');
    const list = Array.isArray(sessions) ? sessions : [];
    const hashSessionIds: string[] = [];
    for (const session of list) {
      if (session.hashSessionId) hashSessionIds.push(session.hashSessionId);
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: session.id,
        isActive: false
      }, 'sessions');
    }
    return hashSessionIds;
  },
});

// Main Repository Factory
export function createRepository(userDO: DurableObjectStub<UserDO>) {
  return {
    users: createUserRepository(userDO),
    sessions: createSessionRepository(userDO),
  };
}

// KV Service Implementation
export function createKvService(env: Env): IKvService {
  return {
    async saveNonce(sessionId: string, nonce: string, expirationTtlSec?: number): Promise<void> {
      await storeSessionNonce(env.NONCE_KV, sessionId, nonce, expirationTtlSec);
    },

    async validateNonce(sessionId: string, nonce: string): Promise<boolean> {
      return consumeSessionNonce(env.NONCE_KV, sessionId, nonce);
    },
  };
}

// OTP Service Implementation
export function createOTPService(env: Env): IOTPService {
  const kvService = createKvService(env);
  
  const sendEmail = async (email: string, otp: string, language?: 'vi' | 'en'): Promise<void> => {
    const brevoApiKey = await env.BREVO_API_KEY.get();
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY is not defined in environment variables");
    }

    // Tiếng Việt: templateId=1, Tiếng Anh: templateId=2
    const templateId = language === 'en' ? 2 : 1;
    const actionText = language === 'en' ? 'API login' : 'đăng nhập API';

    const emailData = {
      templateId,
      to: [{ email }],
      params: {
        OTP: otp,
        action: actionText,
      },
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email OTP: ${await response.text()}`);
    }
  };

  // Template Brevo: session mới - VI: 5, EN: 6. Params: IP_ADDRESS, USER_AGENT, LOGIN_TIME
  const sendNewSessionEmail = async (
    email: string,
    ipAddress: string,
    userAgent: string,
    language?: 'vi' | 'en'
  ): Promise<void> => {
    const brevoApiKey = await env.BREVO_API_KEY.get();
    if (!brevoApiKey) return; // Không block login nếu thiếu config

    const templateId = language === 'en' ? 4 : 3;
    const loginTime = new Date().toLocaleString(language === 'en' ? 'en-US' : 'vi-VN');

    const emailData = {
      templateId,
      to: [{ email }],
      params: {
        ipAddress: ipAddress || '-',
        userAgent: userAgent || '-',
        loginTime: loginTime,
      },
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      console.warn('[Auth] Failed to send new session notification:', await response.text());
    }
  };

  const formatOtpExpiryText = (expirySeconds: number): string => {
    if (expirySeconds % 60 === 0) {
      const minutes = Math.max(1, Math.floor(expirySeconds / 60));
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    }
    return `${Math.max(1, expirySeconds)} seconds`;
  };

  const sendSMS = async (phone: string, otp: string, expirySeconds = AUTH_CONSTANTS.OTP_EXPIRY): Promise<void> => {    
    // const apiKey= await env.VONAGE_API_KEY.get();
    // const apiSecret= await env.VONAGE_API_SECRET.get();
    // if (!apiKey || !apiSecret) {
    //   throw new Error("VONAGE_API_KEY or VONAGE_API_SECRET is not defined in environment variables");
    // }
    const authToken= await env.VONAGE_AUTH_TOKEN.get();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined in environment variables");
    }
    const messageText = `Your OTP code is: ${otp}. This code will expire in ${formatOtpExpiryText(expirySeconds)}.`;
    
    // const payload = {
    //   from: '14157386102',
    //   to: phone,
    //   channel: "whatsapp",
    //   message_type: "text",          
    //   text: messageText,    
    //   failover: [
    //     {
    //       from: '22353',
    //       to: phone,
    //       channel: "viber_service",
    //       message_type: "text",
    //       text: messageText,    
    //     },        
    //     {
    //       from: env.SMS_FROM_NUMBER,
    //       to: phone,          
    //       channel: "sms",
    //       message_type: "text",
    //       text: messageText,
    //     },
    //   ]      
    // };
    const payload = {
      from: '15558308877',
      to: phone,
      channel: "whatsapp",
      message_type: "text",          
      text: messageText,    
      failover: [
        {
          from: env.SMS_FROM_NUMBER,
          to: phone,          
          channel: "sms",
          message_type: "text",
          text: messageText,
        },
      ]      
    };    

    // const auth = btoa(`${apiKey}:${apiSecret}`);
    const response = await fetch("https://api.nexmo.com/v1/messages", {  
    //const response = await fetch("https://messages-sandbox.nexmo.com/v1/messages", {  
      method: "POST",
      headers: {
        // "Authorization": `Basic ${auth}`,
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send SMS OTP via VONAGE: ${JSON.stringify(errorData)}`);
    }
  };

  const otpNonceKey = (sessionId: string) => `Nonce:${sessionId}`;

  const getOtpPepper = async (): Promise<string> => requireEncryptionSecret(env);

  const failOtpVerify = async (sessionId: string, identifier?: string): Promise<false> => {
    await recordOtpVerifyFailure(env, sessionId, identifier);
    const afterFail = await checkOtpVerifyBlocked(env, sessionId);
    if (afterFail.blocked) {
      throw new OtpRateLimitError(afterFail.retryAfter);
    }
    return false;
  };

  return {
    async generateOTP(sessionId: string, identifier: string): Promise<string> {
      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      const otp = otpUtils.generateOTP();
      const pepper = await getOtpPepper();
      const otpHash = await hashPendingLoginOtp(sessionId, normalizedId, otp, pepper);
      await clearOtpVerifyAttempts(env, sessionId);
      await env.NONCE_KV.put(
        otpNonceKey(sessionId),
        JSON.stringify({ otpHash, identifier: normalizedId } satisfies PendingLoginOtpRecord),
        { expirationTtl: AUTH_CONSTANTS.OTP_EXPIRY },
      );
      return otp;
    },

    async verifyOTP(otp: string, sessionId: string, identifier: string): Promise<boolean> {
      const blocked = await checkOtpVerifyBlocked(env, sessionId);
      if (blocked.blocked) {
        throw new OtpRateLimitError(blocked.retryAfter);
      }

      const nonceKey = otpNonceKey(sessionId);
      const nonceStr = await env.NONCE_KV.get(nonceKey);
      if (!nonceStr) {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      let nonceData: PendingLoginOtpRecord;
      try {
        nonceData = JSON.parse(nonceStr) as PendingLoginOtpRecord;
      } catch {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      if (!nonceData.identifier || nonceData.identifier !== normalizedId) {
        return await failOtpVerify(sessionId, normalizedId);
      }

      const pepper = await getOtpPepper();
      const isValid = await verifyPendingLoginOtp(sessionId, normalizedId, otp, nonceData, pepper);
      if (!isValid) {
        return await failOtpVerify(sessionId, normalizedId);
      }

      await env.NONCE_KV.delete(nonceKey);
      await clearOtpVerifyAttempts(env, sessionId);
      return true;
    },

    async sendEmailOTP(email: string, otp: string, language?: 'vi' | 'en'): Promise<void> {
      await sendEmail(email, otp, language);
    },

    async sendSmsOTP(phone: string, otp: string, expirySeconds?: number): Promise<void> {
      await sendSMS(phone, otp, expirySeconds);
    },

    async sendNewSessionNotification(
      email: string,
      ipAddress: string,
      userAgent: string,
      language?: 'vi' | 'en'
    ): Promise<void> {
      await sendNewSessionEmail(email, ipAddress, userAgent, language);
    },
  };
}

// Wallet Service Implementation
export function createWalletService(env: Env): IWalletService {
  const kvService = createKvService(env);
  const validateSiweFields= async (
    fields: SiweMessage, 
    options: {
      expectedDomain?: string;
      expectedOrigin?: string;
      maxMessageAge?: number; // Thay thế maxExpirationHours
    }
  ): Promise<void> => {
    const {
      expectedDomain,
      expectedOrigin,
      maxMessageAge = 5 * 60 * 1000, // 5 minutes default
    } = options;

    const now = new Date();

    // 1. Validate domain (QUAN TRỌNG)
    if (expectedDomain && fields.domain !== expectedDomain) {
      throw new Error(`Invalid domain: expected ${expectedDomain}, got ${fields.domain}`);
    }

    // 2. Validate URI/origin
    if (expectedOrigin && fields.uri !== expectedOrigin) {
      throw new Error(`Invalid URI: expected ${expectedOrigin}, got ${fields.uri}`);
    }

    // 3. Validate statement exists
    if (!fields.statement || typeof fields.statement !== 'string') {
      throw new Error('Missing authentication statement');
    }

    // 4. Validate message age (thay thế expiration time)
    const issuedAt = new Date(fields.issuedAt || 0);
    const messageAge = now.getTime() - issuedAt.getTime();
    
    if (messageAge > maxMessageAge) {
      throw new Error(`Message is too old: ${Math.round(messageAge / 1000)} seconds`);
    }

    // 5. Validate issuedAt is not in the future (allow small clock skew)
    if (issuedAt > new Date(now.getTime() + 2 * 60 * 1000)) { // 2 minutes clock skew
      throw new Error('Message issued in the future');
    }

    // 6. Validate version
    if (fields.version !== '1') {
      throw new Error(`Unsupported version: ${fields.version}`);
    }

    // 7. Validate chainId (optional)
    if (fields.chainId !== 1) { // Chỉ cho phép Ethereum mainnet
      throw new Error(`Unsupported chain: ${fields.chainId}`);
    }

    // 8. Validate address format
    if (!fields.address || !fields.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid Ethereum address');
    }
  }
  
  return {
    async generateNonceAndStore(sessionId: string): Promise<string> {
      const nonce = generateNonce();
      await kvService.saveNonce(sessionId, nonce);
      return nonce;
    },

    async verifySignature(
      sessionId: string, 
      message: string, 
      signature: string,
      expectedDomain: string = 'aiagents-hub.vn',
      expectedOrigin: string = 'https://aiagents-hub.vn'
    ): Promise<SiweMessage> {
      // 1. Parse message
      let siweMessage: SiweMessage;
      siweMessage = new SiweMessage(message);

      // 2. Validate signature format
      const sig = signature.startsWith('0x') ? signature : `0x${signature}`;
      if (!sig.match(/^0x[a-fA-F0-9]{130}$/)) {
        throw new Error('Invalid signature format');
      }

      // 3. Verify signature với nonce constraint
      const verificationResult = await siweMessage.verify({ signature: sig });

      if (!verificationResult.success) {
        throw new Error(`Signature verification failed: ${verificationResult.error}`);
      }
      
      const { data: fields } = verificationResult;

      const nonceValid = await kvService.validateNonce(sessionId, fields.nonce);
      if (!nonceValid) {
        throw new Error('Invalid nonce');
      }

      // 4. Validate additional fields
      await validateSiweFields(fields, {
        expectedDomain,
        expectedOrigin,
        maxMessageAge: 10 * 60 * 1000, // 10 minutes max age
      });

      return fields;
    }
  };
}

// OAuth Service Implementation
export function createOAuthService(env: Env): IOAuthService {
  const kvService = createKvService(env);

  const exchangeCodeForToken = async (code: string, config: any): Promise<OAuthTokenResponse> => {
    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${errorText}`);
    }

    const tokenData = await response.json();
    return OAuthTokenResponseSchema.parse(tokenData);
  };

  const fetchUserInfo = async (provider: string, accessToken: string, config: any): Promise<any> => {
    const response = await fetch(config.userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Unitoken-Auth',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info from ${provider}: ${response.status} ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Unexpected response format from ${provider}: ${contentType}`);
    }

    const userInfo = await response.json();

    const schemaMap: Record<string, any> = {
      google: GoogleUserInfoSchema,
      apple: AppleUserInfoSchema,
      facebook: FacebookUserInfoSchema,
      github: GitHubUserInfoSchema,
      twitter: TwitterUserInfoSchema,
    };

    const schema = schemaMap[provider];
    if (!schema) throw new Error(`Unsupported provider: ${provider}`);

    return schema.parse(userInfo);
  };

  return {
    async generateState(sessionId: string): Promise<string> {
      const nonce = generateNonce();
      await kvService.saveNonce(sessionId, nonce);
      const signingSecret = await requireEncryptionSecret(env);
      return encodeOAuthState(sessionId, nonce, signingSecret);
    },

    async exchangeOAuthCode(provider: string, state: string, code: string): Promise<{ tokenData: OAuthTokenResponse; sessionId: string }> {
      const signingSecret = await requireEncryptionSecret(env);
      const parsed = await decodeOAuthState(state, signingSecret);
      if (!parsed) {
        throw new Error(ERROR_MESSAGES.AUTH.OAUTH_STATE_INVALID);
      }
      const isValidNonce = await kvService.validateNonce(parsed.sessionId, parsed.nonce);
      if (!isValidNonce) {
        throw new Error(ERROR_MESSAGES.AUTH.OAUTH_STATE_INVALID);
      }

      const config = await oauthUtils.getOAuthConfig(provider, env);
      const tokenData = await exchangeCodeForToken(code, config);
      return { tokenData, sessionId: parsed.sessionId };
    },

    async getUserInfoFromProvider(provider: string, accessToken: string): Promise<any> {
      const config = await oauthUtils.getOAuthConfig(provider, env);
      return await fetchUserInfo(provider, accessToken, config);
    }
  };
}