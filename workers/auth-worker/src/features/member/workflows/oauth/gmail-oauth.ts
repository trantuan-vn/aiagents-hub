import { encodeOAuthState, decodeOAuthState } from '../../../../shared/oauth-state.js';
import { storeSessionNonce, consumeSessionNonce } from '../../../../shared/kv-nonce.js';
import { oauthUtils } from '../../../auth/utils.js';
import { GoogleUserInfoSchema } from '../../../auth/domain.js';
import { createCredential, type PublicCredential } from '../storage/credentials.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';

const GMAIL_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const CFG_TTL_SEC = 600;
const CFG_PREFIX = 'wf_gmail_oauth_cfg:';
/** Prefix in OAuth state.sessionId so login callback can detect Gmail credential flows. */
export const GMAIL_OAUTH_STATE_PREFIX = 'wf_gmail:';

export type GmailOAuthPendingConfig = {
  identifier: string;
  oauthMode: string;
  allowedHttpRequestDomains: string;
};

function gmailRedirectUri(env: Env): string {
  // Must match the already-registered Google login callback to avoid redirect_uri_mismatch.
  const base = (env.BASE_URL || '').replace(/\/$/, '');
  return `${base}/dashboard/auth/oauth/google/callback`;
}

function frontendCallbackUrl(env: Env, query: Record<string, string>): string {
  const base = (env.FRONTEND_URL || 'https://aiagents-hub.vn').replace(/\/$/, '');
  const qs = new URLSearchParams(query);
  return `${base}/oauth/gmail/callback?${qs.toString()}`;
}

async function requireSigningSecret(env: Env): Promise<string> {
  const secret = await env.ENCRYPTION_SECRET.get();
  if (!secret) throw new Error('ENCRYPTION_SECRET is not configured');
  return secret;
}

function cfgKey(stateSessionId: string, nonce: string): string {
  return `${CFG_PREFIX}${stateSessionId}:${nonce}`;
}

function toStateSessionId(identifier: string): string {
  return `${GMAIL_OAUTH_STATE_PREFIX}${identifier}`;
}

function fromStateSessionId(stateSessionId: string): string | null {
  if (!stateSessionId.startsWith(GMAIL_OAUTH_STATE_PREFIX)) return null;
  const id = stateSessionId.slice(GMAIL_OAUTH_STATE_PREFIX.length).trim();
  return id || null;
}

/** True when this OAuth state belongs to a Gmail credential popup flow. */
export async function isGmailCredentialOAuthState(env: Env, state: string): Promise<boolean> {
  if (!state) return false;
  try {
    const signingSecret = await requireSigningSecret(env);
    const parsed = await decodeOAuthState(state, signingSecret);
    if (!parsed) return false;
    if (fromStateSessionId(parsed.sessionId)) return true;
    if (!env.NONCE_KV) return false;
    const rawCfg = await env.NONCE_KV.get(cfgKey(parsed.sessionId, parsed.nonce));
    return !!rawCfg;
  } catch {
    return false;
  }
}

/** Build Google consent URL for Gmail workflow credentials (popup flow). */
export async function startGmailOAuth(
  env: Env,
  input: GmailOAuthPendingConfig,
): Promise<{ url: string }> {
  if (!env.NONCE_KV) throw new Error('NONCE_KV is not configured');

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const stateSessionId = toStateSessionId(input.identifier);
  await storeSessionNonce(env.NONCE_KV, stateSessionId, nonce, CFG_TTL_SEC);

  const signingSecret = await requireSigningSecret(env);
  const state = await encodeOAuthState(stateSessionId, nonce, signingSecret);

  await env.NONCE_KV.put(cfgKey(stateSessionId, nonce), JSON.stringify(input), {
    expirationTtl: CFG_TTL_SEC,
  });

  const config = await oauthUtils.getOAuthConfig('google', env);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: gmailRedirectUri(env),
    response_type: 'code',
    scope: GMAIL_OAUTH_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

async function exchangeGmailCode(
  env: Env,
  code: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const config = await oauthUtils.getOAuthConfig('google', env);
  const params = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: gmailRedirectUri(env),
    grant_type: 'authorization_code',
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail OAuth token exchange failed: ${errorText}`);
  }

  const tokenData = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) throw new Error('Gmail OAuth did not return an access token');
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
  };
}

async function fetchGoogleEmail(env: Env, accessToken: string): Promise<string> {
  const config = await oauthUtils.getOAuthConfig('google', env);
  const response = await fetch(config.userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to load Google profile: ${errorText}`);
  }
  const userInfo = GoogleUserInfoSchema.parse(await response.json());
  return userInfo.email.toLowerCase();
}

export type GmailOAuthCompleteResult = {
  credential: PublicCredential;
  email: string;
};

/** Complete Gmail OAuth after Google redirects back with ?code=&state=. */
export async function completeGmailOAuth(
  env: Env,
  getUserDO: (identifier: string) => DurableObjectStub<UserDO>,
  code: string,
  state: string,
): Promise<GmailOAuthCompleteResult> {
  if (!env.NONCE_KV) throw new Error('NONCE_KV is not configured');

  const signingSecret = await requireSigningSecret(env);
  const parsed = await decodeOAuthState(state, signingSecret);
  if (!parsed) throw new Error('Invalid OAuth state');

  const identifier =
    fromStateSessionId(parsed.sessionId) ??
    // Legacy states used raw identifier as sessionId.
    parsed.sessionId;

  const ok = await consumeSessionNonce(env.NONCE_KV, parsed.sessionId, parsed.nonce);
  if (!ok) throw new Error('Invalid or expired OAuth state');

  const rawCfg = await env.NONCE_KV.get(cfgKey(parsed.sessionId, parsed.nonce));
  await env.NONCE_KV.delete(cfgKey(parsed.sessionId, parsed.nonce));
  if (!rawCfg) throw new Error('OAuth session expired — try again');

  const cfg = JSON.parse(rawCfg) as GmailOAuthPendingConfig;
  if (cfg.identifier !== identifier) throw new Error('OAuth identity mismatch');

  const tokens = await exchangeGmailCode(env, code);
  const email = await fetchGoogleEmail(env, tokens.access_token);

  const secretPayload = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null,
  });

  const credential = await createCredential(getUserDO(cfg.identifier), env, {
    name: `Gmail account (${email})`,
    type: 'bearer',
    secret: secretPayload,
    meta: {
      provider: 'gmail',
      oauthMode: cfg.oauthMode || 'managed',
      allowedHttpRequestDomains: cfg.allowedHttpRequestDomains || 'all',
      connected: true,
      username: email,
    },
  });

  return { credential, email };
}

/** Redirect popup back to the frontend (same origin as opener) so postMessage works under COOP. */
export function gmailOAuthFrontendRedirect(
  env: Env,
  payload: {
    ok: boolean;
    credentialKey?: string;
    name?: string;
    email?: string;
    error?: string;
  },
): string {
  const query: Record<string, string> = {
    ok: payload.ok ? '1' : '0',
  };
  if (payload.credentialKey) query.credentialKey = payload.credentialKey;
  if (payload.name) query.name = payload.name;
  if (payload.email) query.email = payload.email;
  if (payload.error) query.error = payload.error;
  return frontendCallbackUrl(env, query);
}

/** Fallback HTML if redirect is unavailable. */
export function gmailOAuthPopupHtml(payload: {
  ok: boolean;
  credentialKey?: string;
  name?: string;
  email?: string;
  error?: string;
}): string {
  const data = JSON.stringify({
    type: 'aiagents-hub:gmail-oauth',
    ...payload,
  });
  const title = payload.ok ? 'Connected' : 'Connection failed';
  const detail = payload.ok
    ? `Connected as ${payload.email ?? 'Gmail'}. You can close this window.`
    : payload.error || 'Unknown error';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#111}
  .box{max-width:28rem;padding:1.5rem;border:1px solid #e5e5e5;border-radius:12px;background:#fff;text-align:center}
  h1{font-size:1.125rem;margin:0 0 .5rem}
  p{font-size:.875rem;color:#555;margin:0}
</style>
</head>
<body>
<div class="box">
  <h1>${title}</h1>
  <p id="msg">${detail.replace(/</g, '&lt;')}</p>
</div>
<script>
(function () {
  var msg = ${data};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, '*');
    }
  } catch (e) {}
  setTimeout(function () {
    try { window.close(); } catch (e) {}
  }, 400);
})();
</script>
</body></html>`;
}

/** Extract bearer access token from stored Gmail OAuth secret (plain or JSON). */
export function resolveGmailBearerSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { access_token?: string };
    if (typeof parsed.access_token === 'string' && parsed.access_token) {
      return parsed.access_token;
    }
  } catch {
    /* plain token */
  }
  return trimmed;
}

/** Refresh a Gmail OAuth access token using the stored refresh_token. */
export async function refreshGmailAccessToken(
  env: Env,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const config = await oauthUtils.getOAuthConfig('google', env);
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail OAuth token refresh failed: ${errorText}`);
  }

  const tokenData = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) throw new Error('Gmail OAuth refresh did not return an access token');
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
  };
}
