import { interpolate } from '../../../execution/node-runtime.js';
import {
  resolveCredential,
  updateCredentialSecret,
} from '../../../storage/credentials.js';
import {
  refreshGmailAccessToken,
  resolveGmailBearerSecret,
} from '../../../oauth/gmail-oauth.js';
import type { NodeContext, NodeOutput } from '../../types.js';

type GmailTokenPayload = {
  access_token?: string;
  refresh_token?: string | null;
  expires_at?: number | null;
};

function parseTokenPayload(secret: string): GmailTokenPayload | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as GmailTokenPayload;
  } catch {
    return null;
  }
}

function encodeRfc2047Subject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function toBase64Url(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMimeMessage(params: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): string {
  const headers = [
    `To: ${params.to}`,
    ...(params.from ? [`From: ${params.from}`] : []),
    `Subject: ${encodeRfc2047Subject(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${params.body}`;
}

async function sendViaGmailApi(accessToken: string, raw: string): Promise<{ id?: string }> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (res.ok) {
    return (await res.json()) as { id?: string };
  }
  const errText = await res.text();
  const err = new Error(`Gmail send failed (${res.status}): ${errText.slice(0, 500)}`);
  (err as Error & { status?: number }).status = res.status;
  throw err;
}

async function resolveAccessToken(
  ctx: NodeContext,
  credentialKey: string,
  secret: string,
): Promise<string> {
  const payload = parseTokenPayload(secret);
  const expiresAt = payload?.expires_at ?? null;
  const refreshToken = payload?.refresh_token;
  const needsRefresh =
    typeof expiresAt === 'number' && expiresAt > 0 && Date.now() > expiresAt - 60_000;

  if (needsRefresh && refreshToken) {
    const refreshed = await refreshGmailAccessToken(ctx.c.env, refreshToken);
    const nextSecret = JSON.stringify({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? refreshToken,
      expires_at: refreshed.expires_in
        ? Date.now() + refreshed.expires_in * 1000
        : null,
    });
    await updateCredentialSecret(ctx.userDO, ctx.c.env, credentialKey, nextSecret);
    return refreshed.access_token;
  }

  return resolveGmailBearerSecret(secret);
}

/**
 * Send a Gmail message for human_review channel=gmail before the engine pauses.
 * "Send and Wait for Response" still pauses after a successful send.
 */
export async function executeGmailHumanReview(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const scope: Record<string, unknown> = {
    ...ctx.nodeInput,
    $json: ctx.nodeInput,
    json: ctx.nodeInput,
    text: ctx.nodeInput.text ?? ctx.input ?? '',
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };

  const credentialKey = String(data.credentialKey ?? data.credentialId ?? '').trim();
  if (!credentialKey) {
    throw new Error('Gmail human review requires a connected Gmail credential');
  }

  const to = String(interpolate(String(data.to ?? ''), scope) ?? '').trim();
  const subject = String(interpolate(String(data.subject ?? ''), scope) ?? '').trim();
  const message = String(interpolate(String(data.message ?? ''), scope) ?? '').trim();
  if (!to) throw new Error('Gmail human review requires a To address');
  if (!subject) throw new Error('Gmail human review requires a Subject');

  const credential = await resolveCredential(ctx.userDO, ctx.c.env, credentialKey);
  if (!credential?.secret) {
    throw new Error('Gmail credential not found — reconnect the Gmail account');
  }
  if (credential.meta.provider && credential.meta.provider !== 'gmail') {
    throw new Error('Selected credential is not a Gmail OAuth credential');
  }

  const frontend = String(ctx.c.env.FRONTEND_URL || 'https://aiagents-hub.vn').replace(/\/$/, '');
  const responseType = String(data.responseType ?? 'approval');
  const footer =
    responseType === 'approval'
      ? `\n\n---\nThis workflow is waiting for your approval.\nOpen Executions in the workflow editor to Approve or Reject:\n${frontend}/dashboard/build/workflows/${ctx.meta.workflowId}/edit`
      : '';

  const fromEmail =
    typeof credential.meta.username === 'string' ? credential.meta.username : undefined;
  const raw = toBase64Url(
    buildMimeMessage({
      to,
      subject,
      body: `${message}${footer}`,
      from: fromEmail,
    }),
  );

  let accessToken = await resolveAccessToken(ctx, credentialKey, credential.secret);
  try {
    const sent = await sendViaGmailApi(accessToken, raw);
    return {
      channel: 'gmail',
      sent: true,
      to,
      subject,
      messageId: sent.id,
      responseType,
    };
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    const payload = parseTokenPayload(credential.secret);
    if (status === 401 && payload?.refresh_token) {
      const refreshed = await refreshGmailAccessToken(ctx.c.env, payload.refresh_token);
      const nextSecret = JSON.stringify({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? payload.refresh_token,
        expires_at: refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : null,
      });
      await updateCredentialSecret(ctx.userDO, ctx.c.env, credentialKey, nextSecret);
      accessToken = refreshed.access_token;
      const sent = await sendViaGmailApi(accessToken, raw);
      return {
        channel: 'gmail',
        sent: true,
        to,
        subject,
        messageId: sent.id,
        responseType,
        refreshedToken: true,
      };
    }
    throw e;
  }
}
