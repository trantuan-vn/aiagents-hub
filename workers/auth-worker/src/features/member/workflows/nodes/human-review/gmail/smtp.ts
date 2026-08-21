export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const GMAIL_SMTP_PORT = 465;

const EHLO_HOST = 'aiagents-hub.vn';
const SMTP_TIMEOUT_MS = 20_000;

export type SmtpIo = {
  readLine: () => Promise<string>;
  write: (line: string) => Promise<void>;
};

export type SmtpMail = {
  from: string;
  to: string;
  rawMessage: string;
  username: string;
  password: string;
};

export type SmtpConnectOpts = {
  host: string;
  port: number;
};

type CredentialLike = {
  type: string;
  meta: { authMethod?: string; provider?: string };
};

export function isGmailSmtpCredential(cred: CredentialLike): boolean {
  if (cred.meta.authMethod === 'smtp') return true;
  return cred.type === 'basic' && cred.meta.provider === 'gmail';
}

export function normalizeSmtpPassword(password: string): string {
  return password.replace(/\s+/g, '');
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function encodeAuthPlain(username: string, password: string): string {
  return encodeBase64(`\u0000${username}\u0000${normalizeSmtpPassword(password)}`);
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), SMTP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function readReply(io: SmtpIo): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  while (true) {
    const line = await withTimeout(io.readLine(), 'SMTP server timed out');
    lines.push(line);
    if (line.length >= 4 && line[3] === ' ') {
      return { code: Number.parseInt(line.slice(0, 3), 10), text: lines.join('\n') };
    }
    if (line.length === 3 && /^\d{3}$/.test(line)) {
      return { code: Number.parseInt(line, 10), text: lines.join('\n') };
    }
  }
}

async function expectCode(io: SmtpIo, expected: number, command: string): Promise<string> {
  const reply = await readReply(io);
  if (reply.code !== expected) {
    throw new Error(`${command} failed (${reply.code}): ${reply.text.slice(0, 400)}`);
  }
  return reply.text;
}

function dotStuff(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  return normalized
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/** SMTP conversation after the TCP/TLS socket is ready (greeting still unread). */
export async function smtpSendWithIo(
  io: SmtpIo,
  mail: SmtpMail,
  opts?: { skipGreeting?: boolean },
): Promise<{ messageId?: string }> {
  if (!opts?.skipGreeting) {
    await expectCode(io, 220, 'SMTP greeting');
  }

  await io.write(`EHLO ${EHLO_HOST}`);
  await expectCode(io, 250, 'EHLO');

  await io.write(`AUTH PLAIN ${encodeAuthPlain(mail.username, mail.password)}`);
  await expectCode(io, 235, 'AUTH PLAIN');

  await io.write(`MAIL FROM:<${mail.from}>`);
  await expectCode(io, 250, 'MAIL FROM');

  await io.write(`RCPT TO:<${mail.to}>`);
  await expectCode(io, 250, 'RCPT TO');

  await io.write('DATA');
  await expectCode(io, 354, 'DATA');

  const stuffed = dotStuff(mail.rawMessage).replace(/(\r\n)?$/, '\r\n');
  await io.write(`${stuffed}.`);
  const queued = await expectCode(io, 250, 'DATA body');

  try {
    await io.write('QUIT');
  } catch {
    /* server may close after 250 */
  }

  const idMatch = queued.match(/queued as\s+(\S+)/i) || queued.match(/\b([A-Za-z0-9._-]{8,})\b/);
  return { messageId: idMatch?.[1] };
}

function createLineIo(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
): SmtpIo & { close: () => Promise<void> } {
  const reader = readable.getReader();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const readLine = async (): Promise<string> => {
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      buffer += decoder.decode(value, { stream: true });
    }
  };

  const write = async (line: string): Promise<void> => {
    const payload = line.endsWith('\r\n') ? line : `${line}\r\n`;
    await writer.write(encoder.encode(payload));
  };

  return {
    readLine,
    write,
    close: async () => {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Send mail through Gmail (or compatible) SMTP using email + app password. */
export async function sendMailViaSmtp(
  conn: SmtpConnectOpts,
  mail: SmtpMail,
): Promise<{ messageId?: string }> {
  const { connect } = await import('cloudflare:sockets');
  const useStartTls = conn.port === 587;
  const socket = connect(
    { hostname: conn.host, port: conn.port },
    { secureTransport: useStartTls ? 'starttls' : 'on', allowHalfOpen: false },
  );
  await withTimeout(socket.opened, 'Could not connect to SMTP server');

  let io = createLineIo(socket.readable, socket.writable);
  try {
    if (useStartTls) {
      await expectCode(io, 220, 'SMTP greeting');
      await io.write(`EHLO ${EHLO_HOST}`);
      await expectCode(io, 250, 'EHLO');
      await io.write('STARTTLS');
      await expectCode(io, 220, 'STARTTLS');
      await io.close();
      const tlsSocket = socket.startTls({ expectedServerHostname: conn.host });
      await withTimeout(tlsSocket.opened, 'SMTP STARTTLS handshake timed out');
      io = createLineIo(tlsSocket.readable, tlsSocket.writable);
      return await smtpSendWithIo(io, mail, { skipGreeting: true });
    }
    return await smtpSendWithIo(io, mail);
  } finally {
    try {
      await io.close();
    } catch {
      /* ignore */
    }
    try {
      await socket.close();
    } catch {
      /* ignore */
    }
  }
}
