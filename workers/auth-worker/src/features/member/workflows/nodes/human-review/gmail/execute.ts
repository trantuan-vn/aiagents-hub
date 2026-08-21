import { interpolate } from '../../../execution/node-runtime.js';
import { resolveCredential } from '../../../storage/credentials.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import {
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
  isGmailSmtpCredential,
  sendMailViaSmtp,
} from './smtp.js';
import { sendViaPlatformEmail } from './platform-email.js';

function encodeRfc2047Subject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
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

function approvalFooter(frontend: string, workflowId: number, responseType: string): string {
  if (responseType !== 'approval') return '';
  return `\n\n---\nThis workflow is waiting for your approval.\nOpen Executions in the workflow editor to Approve or Reject:\n${frontend}/dashboard/build/workflows/${workflowId}/edit`;
}

/**
 * Send a human-review email, then the engine pauses.
 * Default: platform sender (noreply@aiagents-hub.vn).
 * Optional: Gmail SMTP with email + app password.
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

  const to = String(interpolate(String(data.to ?? ''), scope) ?? '').trim();
  const subject = String(interpolate(String(data.subject ?? ''), scope) ?? '').trim();
  const message = String(interpolate(String(data.message ?? ''), scope) ?? '').trim();
  if (!to) throw new Error('Gmail human review requires a To address');
  if (!subject) throw new Error('Gmail human review requires a Subject');

  const frontend = String(ctx.c.env.FRONTEND_URL || 'https://aiagents-hub.vn').replace(/\/$/, '');
  const responseType = String(data.responseType ?? 'approval');
  const body = `${message}${approvalFooter(frontend, ctx.meta.workflowId, responseType)}`;

  const credentialKey = String(data.credentialKey ?? data.credentialId ?? '').trim();
  if (credentialKey) {
    const credential = await resolveCredential(ctx.userDO, ctx.c.env, credentialKey);
    if (credential?.secret && isGmailSmtpCredential(credential)) {
      const fromEmail =
        typeof credential.meta.username === 'string' ? credential.meta.username.trim() : '';
      if (!fromEmail) throw new Error('Gmail SMTP credential is missing the sender email');
      const host =
        typeof credential.meta.smtpHost === 'string' && credential.meta.smtpHost.trim()
          ? credential.meta.smtpHost.trim()
          : GMAIL_SMTP_HOST;
      const parsedPort = Number(credential.meta.smtpPort);
      const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : GMAIL_SMTP_PORT;
      const sent = await sendMailViaSmtp(
        { host, port },
        {
          from: fromEmail,
          to,
          rawMessage: buildMimeMessage({ to, subject, body, from: fromEmail }),
          username: fromEmail,
          password: credential.secret,
        },
      );
      return {
        channel: 'gmail',
        sent: true,
        via: 'smtp',
        to,
        subject,
        messageId: sent.messageId,
        responseType,
      };
    }
  }

  const sent = await sendViaPlatformEmail(ctx.c.env, { to, subject, text: body });
  return {
    channel: 'gmail',
    sent: true,
    via: 'platform',
    to,
    subject,
    messageId: sent.messageId,
    responseType,
  };
}
