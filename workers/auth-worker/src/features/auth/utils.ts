import jwt from '@tsndr/cloudflare-worker-jwt';
import { mnemonicToAccount, generateMnemonic, english } from 'viem/accounts'; 
import { encryptField } from '../../shared/field-encryption';
import { Context } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import { generateSecureSessionId, getSessionIdHash } from '../../shared/utils';

import { 
  OAuthConfig, 
  OAuthProvider, 
  GoogleUserInfo, 
  AppleUserInfo, 
  FacebookUserInfo, 
  GitHubUserInfo, 
  TwitterUserInfo,
  JwtPayload 
} from './domain'
import { AUTH_CONSTANTS, ERROR_MESSAGES } from './constant';
import { getAuthExpiryFromConfig } from '../admin/system-config/get-auth-expiry';

// I. JWT Utilities
export const jwtUtils = {
  async signJWT(payload: JwtPayload, secret: string): Promise<string> {
    const token = await jwt.sign(payload, secret);
    return token;
  },

  async verifyJWT(token: string, secret: string): Promise<{
    ok: boolean;
    payload?: JwtPayload;
    error?: string;
  }> {
    const genericError = ERROR_MESSAGES.AUTH.INVALID_TOKEN;
    try {
      // Validate token format first
      if (!token || typeof token !== 'string') {
        return { ok: false, error: genericError };
      }      
      const jwtData = await jwt.verify(token, secret, { throwError: true });
      if (!jwtData) {
        return { ok: false, error: genericError };
      }

      const decoded = jwt.decode(token);
      if (!decoded?.payload) {
        return { ok: false, error: genericError };
      }
      // Validate JWT payload structure
      const payload = decoded.payload as JwtPayload;
      if (!payload.sub || !payload.exp || !payload.iat || !payload.type) {
        return { ok: false, error: genericError };
      }
      
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return { ok: false, error: genericError };
      }

      return { ok: true, payload: decoded.payload as JwtPayload };
    } catch (error) {
      return {
        ok: false,
        error: genericError,
      };
    }
  },

  async generateAccessToken(
    userId: number, 
    identifier: string, 
    secret: string, 
    expiresInSeconds: number = AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY
  ): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiresInSeconds;
    return await this.signJWT({
      sub: String(userId),
      identifier: identifier.toLowerCase(),
      iat,
      exp,
      type: 'access'
    }, secret);
  },

  /** Decode JWT payload without verification. Use only when auth has failed, to locate session for deactivation. */
  decodePayloadWithoutVerify(token: string): { identifier?: string } | null {
    try {
      if (!token || typeof token !== 'string') return null;
      const decoded = jwt.decode(token);
      const payload = decoded?.payload as JwtPayload | undefined;
      return payload?.identifier ? { identifier: payload.identifier } : null;
    } catch {
      return null;
    }
  },

  async generateRefreshToken(
    userId: number,
    identifier: string, 
    secret: string,
    expiresInSeconds: number = AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY
  ): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiresInSeconds;
    
    return await this.signJWT({
      sub: String(userId),
      identifier: identifier.toLowerCase(),
      iat,
      exp,
      type: 'refresh'
    }, secret);
  }
};

// II. Validation Utilities
export const validationUtils = {
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
  },

  normalizeIdentifier(identifier: string): string {
    if (this.isValidEmail(identifier)) {
      return identifier.toLowerCase();
    } else if (this.isValidPhone(identifier)) {
      const digits = identifier.replace(/\D/g, '');
      return digits;
    }
    return identifier.toLowerCase();
  },

  validateSession(session: any): void {
    if (!session?.isActive) {
      throw new Error(`session is not active: ${JSON.stringify(!session?.isActive)}`);
    }

    if (new Date(session.expiresAt) < new Date()) {
      throw new Error(ERROR_MESSAGES.AUTH.SESSION_EXPIRED);
    }
  },
};

// III. Wallet Utilities
export const walletUtils = {
  async generateWallet(encryptionSecret: string): Promise<{
    address: string;
    privateKey: string;
    mnemonicPhrase: string;
  }> {
    const mnemonic = generateMnemonic(english, 256);
    const account = mnemonicToAccount(mnemonic);
    
    const encryptedPrivateKey = await encryptField(
      account.getHdKey().privateExtendedKey,
      encryptionSecret,
    );

    const encryptedMnemonic = await encryptField(mnemonic, encryptionSecret);
    
    return {
      address: account.address,
      privateKey: encryptedPrivateKey,
      mnemonicPhrase: encryptedMnemonic
    };
  }
};

// IIIb. Phone hash (for SMS 2FA login matching)
export async function hashPhone(phone: string): Promise<string> {
  const normalized = phone.replace(/\D/g, '').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// IV. OTP Utilities
export const otpUtils = {
  generateOTP(length = 6): string {
    const digits = '0123456789';
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[buf[i] % 10];
    }
    return otp;
  },
};

// V. Cookie Utilities
export const cookieUtils = {
  setCookieWithOption(c: Context, name: string, value: string, maxAge: number) {
    const cookieOptions = {
      sameSite: 'lax' as const, 
      httpOnly: true,
      secure: true,
      path: '/',
      domain: '.aiagents-hub.vn',
      maxAge,
    };
    setCookie(c, name, value, cookieOptions);
  },

  clearAuthCookies(c: Context) {
    const cookieOptions = {
      path: '/',
      domain: '.aiagents-hub.vn',
      secure: true,
      sameSite: 'lax' as const,
      httpOnly: true,
    };
    deleteCookie(c, 'sessionId', cookieOptions);
    deleteCookie(c, 'preAuthSessionId', cookieOptions);
    deleteCookie(c, 'preAuthNonce', cookieOptions);
    // Clear legacy cookies if present (backward compat)
    deleteCookie(c, 'token', cookieOptions);
    deleteCookie(c, 'refreshToken', cookieOptions);
  },

  /** Chỉ set cookie sessionId (httpOnly, secure). Lấy expiry từ system config. */
  async setSessionCookieWithConfig(c: Context, sessionId: string) {
    const cfg = await getAuthExpiryFromConfig(c.env);
    this.setCookieWithOption(c, 'sessionId', sessionId, cfg.sessionExpiry);
    this.clearPreAuthSessionId(c);
  },

  /** TTL cho pre-auth session (10 phút) - đủ cho OTP, OAuth redirect, wallet connect */
  PRE_AUTH_SESSION_TTL: 600,

  /**
   * Pre-auth sessionId: SHA256(IP|UA|secret|nonce).
   * nonce ngẫu nhiên/cookie → tránh trùng NAT; vẫn ổn định trong một flow login.
   * Nếu OAuth callback đã set preAuthSessionId (state) mà chưa có nonce → giữ nguyên cookie đó.
   */
  getOrCreatePreAuthSessionId(c: Context, ipAddress: string, userAgent: string, secret: string): string {
    const existingSessionId = getCookie(c, 'preAuthSessionId');
    let nonce = getCookie(c, 'preAuthNonce');

    if (existingSessionId && existingSessionId.length >= 64) {
      if (!nonce || nonce.length < 32) {
        this.setCookieWithOption(c, 'preAuthSessionId', existingSessionId, this.PRE_AUTH_SESSION_TTL);
        return existingSessionId;
      }
      const derived = getSessionIdHash(ipAddress, userAgent, `${secret}|${nonce}`);
      if (derived === existingSessionId) {
        this.setCookieWithOption(c, 'preAuthNonce', nonce, this.PRE_AUTH_SESSION_TTL);
        this.setCookieWithOption(c, 'preAuthSessionId', existingSessionId, this.PRE_AUTH_SESSION_TTL);
        return existingSessionId;
      }
    }

    if (!nonce || nonce.length < 32) {
      nonce = generateSecureSessionId();
    }
    const sessionId = getSessionIdHash(ipAddress, userAgent, `${secret}|${nonce}`);
    this.setCookieWithOption(c, 'preAuthNonce', nonce, this.PRE_AUTH_SESSION_TTL);
    this.setCookieWithOption(c, 'preAuthSessionId', sessionId, this.PRE_AUTH_SESSION_TTL);
    return sessionId;
  },

  clearPreAuthSessionId(c: Context) {
    const opts = { path: '/', domain: '.aiagents-hub.vn', secure: true, sameSite: 'lax' as const, httpOnly: true };
    deleteCookie(c, 'preAuthSessionId', opts);
    deleteCookie(c, 'preAuthNonce', opts);
  },

  /** DID challenge: set khi lấy nonce, get khi link/unlink. */
  setDidChallengeId(c: Context, id: string) {
    this.setCookieWithOption(c, 'didChallengeId', id, 300); // 5 phút
  },

  getDidChallengeId(c: Context): string | undefined {
    return getCookie(c, 'didChallengeId');
  },

  clearDidChallengeId(c: Context) {
    const opts = { path: '/', domain: '.aiagents-hub.vn', secure: true, sameSite: 'lax' as const, httpOnly: true };
    deleteCookie(c, 'didChallengeId', opts);
  }
};

// VI. OAuth Utilities
export const oauthUtils = {
  getOAuthScopes(provider: OAuthProvider): string {
    const scopes: Record<OAuthProvider, string> = {
      google: "openid email profile",
      apple: "name email",
      facebook: "email",
      github: "user:email",
      twitter: "users.read tweet.read",
    };
    return scopes[provider];
  },

  async getOAuthConfig(provider: string, env: Env): Promise<OAuthConfig> {
    const googleClientId= await env.GOOGLE_CLIENT_ID.get();    
    const googleClientSecret= await env.GOOGLE_CLIENT_SECRET.get();
    if (!googleClientId || !googleClientSecret) {
      throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET are not defined in environment variables");
    }
    const appleClientId= await env.APPLE_CLIENT_ID.get();
    const appleClientSecret= await env.APPLE_CLIENT_SECRET.get();
    if (!appleClientId || !appleClientSecret) {
      throw new Error("APPLE_CLIENT_ID or APPLE_CLIENT_SECRET are not defined in environment variables");
    }
    const facebookClientId= await env.FACEBOOK_CLIENT_ID.get();
    const facebookClientSecret= await env.FACEBOOK_CLIENT_SECRET.get();
    if (!facebookClientId || !facebookClientSecret) {
      throw new Error("FACEBOOK_CLIENT_ID or FACEBOOK_CLIENT_SECRET are not defined in environment variables");
    }
    const githubClientId= await env.GITHUB_CLIENT_ID.get();
    const githubClientSecret= await env.GITHUB_CLIENT_SECRET.get();
    if (!githubClientId || !githubClientSecret) {
      throw new Error("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET are not defined in environment variables");
    }
    const twitterClientId= await env.TWITTER_CLIENT_ID.get();
    const twitterClientSecret= await env.TWITTER_CLIENT_SECRET.get();
    if (!twitterClientId || !twitterClientSecret) {
      throw new Error("TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET are not defined in environment variables");
    }
    const configs: { [key: string]: OAuthConfig } = {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
        redirectUri: `${env?.BASE_URL || ""}/dashboard/auth/oauth/google/callback`
      },
      apple: {
        clientId: appleClientId,
        clientSecret: appleClientSecret,
        tokenEndpoint: 'https://appleid.apple.com/auth/token',
        userInfoEndpoint: 'https://appleid.apple.com/auth/userinfo',
        redirectUri: `${env?.BASE_URL || ""}/dashboard/auth/oauth/apple/callback`
      },
      facebook: {
        clientId: facebookClientId,
        clientSecret: facebookClientSecret,
        tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
        userInfoEndpoint: 'https://graph.facebook.com/me?fields=id,name,email',
        redirectUri: `${env?.BASE_URL || ""}/dashboard/auth/oauth/facebook/callback`
      },
      github: {
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        userInfoEndpoint: 'https://api.github.com/user',
        redirectUri: `${env?.BASE_URL || ""}/dashboard/auth/oauth/github/callback`
      },
      twitter: {
        clientId: twitterClientId,
        clientSecret: twitterClientSecret,
        tokenEndpoint: 'https://api.x.com/2/oauth2/token',
        userInfoEndpoint: 'https://api.x.com/2/users/me',
        redirectUri: `${env?.BASE_URL || ""}/dashboard/auth/oauth/twitter/callback`
      }
    };

    const config = configs[provider];
    if (!config?.clientId || !config?.clientSecret) {
      throw new Error(`OAuth configuration missing for ${provider}`);
    }

    return config;
  },

  normalizeOAuthIdentifier(provider: string, userInfo: any): string {
    switch (provider) {
      case 'google':
        const googleInfo = userInfo as GoogleUserInfo;
        return googleInfo.email.toLowerCase();
      
      case 'apple':
        const appleInfo = userInfo as AppleUserInfo;
        return appleInfo.email.toLowerCase();
      
      case 'facebook':
        const fbInfo = userInfo as FacebookUserInfo;
        return fbInfo.email?.toLowerCase() || `fb_${fbInfo.id}@oauth.user`;
      
      case 'github':
        const ghInfo = userInfo as GitHubUserInfo;
        return ghInfo.email?.toLowerCase() || `gh_${ghInfo.login}@oauth.user`;
      
      case 'twitter':
        const twInfo = userInfo as TwitterUserInfo;
        return `tw_${twInfo.data.username}@oauth.user`;
      
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
};

