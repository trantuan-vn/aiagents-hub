import { getCookie, setCookie } from 'hono/cookie';

import { createApplicationService } from '../../../auth/application.js';
import { getClientIpAndUserAgentForSession } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { resolveCredential } from '../storage/credentials.js';

const FORM_ACCESS_TTL = 60 * 60 * 24; // 24h
const FORM_ACCESS_COOKIE = 'form_access';

export type FormAuthMode = 'none' | 'basic' | 'hub_users';

function formAccessKvKey(token: string): string {
  return `form-access:${token}`;
}

function formAccessCookieName(workflowId: number, formPath: string): string {
  const safe = formPath.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `${FORM_ACCESS_COOKIE}_${workflowId}_${safe}`;
}

export function normalizeFormAuth(value: unknown): FormAuthMode {
  const raw = String(value ?? 'none');
  if (raw === 'basic' || raw === 'hub_users' || raw === 'header') return raw === 'header' ? 'hub_users' : raw;
  return 'none';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderFormBasicLoginHtml(params: {
  title: string;
  actionUrl: string;
  error?: string;
}): string {
  const title = escapeHtml(params.title || 'Sign in');
  const error = params.error
    ? `<p class="error">${escapeHtml(params.error)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f6; margin: 0; padding: 2rem 1rem; }
    .card { max-width: 400px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h1 { margin: 0 0 1.25rem; font-size: 1.25rem; text-align: center; }
    .field { margin-bottom: 1rem; display: flex; flex-direction: column; gap: .35rem; }
    label { font-size: .9rem; font-weight: 600; }
    input { font: inherit; padding: .55rem .65rem; border: 1px solid #ccc; border-radius: 8px; }
    button { margin-top: .5rem; width: 100%; padding: .7rem 1rem; border: 0; border-radius: 8px; background: #ff6f00; color: #fff; font-weight: 600; cursor: pointer; }
    button:hover { background: #e66300; }
    .error { color: #b91c1c; font-size: .85rem; margin: 0 0 .75rem; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${error}
    <form method="POST" action="${escapeHtml(params.actionUrl)}">
      <input type="hidden" name="_form_auth" value="login" />
      <div class="field">
        <label for="username">User</label>
        <input id="username" name="username" type="text" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

export function buildHubLoginRedirectUrl(frontendUrl: string, returnUrl: string): string {
  const base = frontendUrl.replace(/\/$/, '');
  const login = new URL(`${base}/auth/v3/login`);
  login.searchParams.set('redirect', returnUrl);
  return login.toString();
}

export async function verifyHubUserSession(
  c: { req: { raw: Request }; env: Env },
  bindingName: string,
): Promise<boolean> {
  const sessionId = getCookie(c as any, 'sessionId');
  if (!sessionId) return false;
  try {
    const { ipAddress, userAgent } = getClientIpAndUserAgentForSession(c.req.raw, c.env);
    const country = (c.req.raw as Request & { cf?: { country?: string } }).cf?.country;
    const applicationService = createApplicationService(c as any, bindingName);
    const result = await applicationService.verifySessionUseCase(
      sessionId,
      ipAddress,
      userAgent,
      country,
    );
    return result.ok;
  } catch {
    return false;
  }
}

export async function hasFormAccessCookie(
  c: { req: { raw: Request }; env: Env },
  workflowId: number,
  formPath: string,
  ownerId: string,
): Promise<boolean> {
  const kv = c.env.NONCE_KV;
  if (!kv) return false;
  const token = getCookie(c as any, formAccessCookieName(workflowId, formPath));
  if (!token) return false;
  const raw = await kv.get(formAccessKvKey(token));
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as { ownerId: string; workflowId: number; formPath: string };
    return (
      data.ownerId === ownerId &&
      data.workflowId === workflowId &&
      data.formPath === formPath.trim().replace(/^\/+/, '')
    );
  } catch {
    return false;
  }
}

export async function grantFormAccess(
  c: any,
  workflowId: number,
  formPath: string,
  ownerId: string,
): Promise<void> {
  const kv = c.env.NONCE_KV as KVNamespace | undefined;
  if (!kv) return;
  const token = crypto.randomUUID().replace(/-/g, '');
  await kv.put(
    formAccessKvKey(token),
    JSON.stringify({ ownerId, workflowId, formPath: formPath.trim().replace(/^\/+/, '') }),
    { expirationTtl: FORM_ACCESS_TTL },
  );
  setCookie(c, formAccessCookieName(workflowId, formPath), token, {
    path: '/',
    domain: '.aiagents-hub.vn',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: FORM_ACCESS_TTL,
  });
}

export async function validateBasicAuthLogin(
  env: Env,
  bindingName: string,
  ownerId: string,
  credentialKey: string,
  username: string,
  password: string,
): Promise<boolean> {
  if (!credentialKey) return false;
  const binding = (env as unknown as Record<string, unknown>)[bindingName] as DurableObjectNamespace;
  const ownerDO = binding.get(binding.idFromString(ownerId)) as DurableObjectStub<UserDO>;
  const cred = await resolveCredential(ownerDO, env, credentialKey);
  if (!cred || cred.type !== 'basic') return false;
  const expectedUser = String(cred.meta.username ?? '').trim();
  const expectedPass = cred.secret;
  return expectedUser === username.trim() && expectedPass === password;
}

export async function isFormAccessGranted(
  c: any,
  bindingName: string,
  params: {
    formAuth: FormAuthMode;
    workflowId: number;
    formPath: string;
    ownerId: string;
    credentialKey?: string;
  },
): Promise<boolean> {
  const { formAuth, workflowId, formPath, ownerId } = params;
  if (formAuth === 'none') return true;
  if (formAuth === 'hub_users') {
    return verifyHubUserSession(c, bindingName);
  }
  if (formAuth === 'basic') {
    if (await hasFormAccessCookie(c, workflowId, formPath, ownerId)) return true;
    return false;
  }
  return true;
}

export async function handleBasicAuthLoginPost(
  c: any,
  bindingName: string,
  params: {
    workflowId: number;
    formPath: string;
    ownerId: string;
    credentialKey?: string;
    returnUrl: string;
    formTitle?: string;
    username: string;
    password: string;
  },
): Promise<Response> {
  const ok = await validateBasicAuthLogin(
    c.env,
    bindingName,
    params.ownerId,
    String(params.credentialKey ?? ''),
    params.username,
    params.password,
  );
  if (!ok) {
    return c.html(
      renderFormBasicLoginHtml({
        title: params.formTitle || 'Sign in',
        actionUrl: params.returnUrl,
        error: 'Invalid username or password',
      }),
      401,
    );
  }
  await grantFormAccess(c, params.workflowId, params.formPath, params.ownerId);
  return c.redirect(params.returnUrl, 302);
}
