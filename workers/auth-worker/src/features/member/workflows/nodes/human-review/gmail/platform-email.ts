const DEFAULT_SENDER_NAME = 'aiagents-hub';

export function platformSenderFromEnv(env: Env): { email: string; name: string } {
  const frontend = String(env.FRONTEND_URL || 'https://aiagents-hub.vn').replace(/\/$/, '');
  let domain = 'aiagents-hub.vn';
  try {
    domain = new URL(frontend).hostname;
  } catch {
    /* keep default */
  }
  return { email: `noreply@${domain}`, name: DEFAULT_SENDER_NAME };
}

export async function sendViaPlatformEmail(
  env: Env,
  opts: { to: string; subject: string; text: string },
): Promise<{ messageId?: string }> {
  const apiKey = await env.BREVO_API_KEY.get();
  if (!apiKey) throw new Error('Email sending is not configured');

  const sender = platformSenderFromEnv(env);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      textContent: opts.text,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Platform email send failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await response.json()) as { messageId?: string };
  return { messageId: data.messageId };
}
