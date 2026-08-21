import { describe, expect, it } from 'vitest';

import {
  encodeAuthPlain,
  isGmailSmtpCredential,
  normalizeSmtpPassword,
  smtpSendWithIo,
  type SmtpIo,
} from './smtp.js';

function scriptedIo(replies: string[]): { io: SmtpIo; writes: string[] } {
  const writes: string[] = [];
  const queue = [...replies];
  const io: SmtpIo = {
    readLine: async () => {
      const next = queue.shift();
      if (next == null) throw new Error('No SMTP reply scripted');
      return next;
    },
    write: async (line) => {
      writes.push(line);
    },
  };
  return { io, writes };
}

describe('gmail smtp helpers', () => {
  it('treats basic gmail credentials as SMTP', () => {
    expect(
      isGmailSmtpCredential({ type: 'basic', meta: { provider: 'gmail', authMethod: 'smtp' } }),
    ).toBe(true);
    expect(isGmailSmtpCredential({ type: 'bearer', meta: { provider: 'gmail' } })).toBe(false);
  });

  it('strips spaces from Google app passwords', () => {
    expect(normalizeSmtpPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
  });

  it('encodes AUTH PLAIN as NUL-user-NUL-pass', () => {
    const encoded = encodeAuthPlain('user@gmail.com', 'ab cd');
    expect(atob(encoded)).toBe('\u0000user@gmail.com\u0000abcd');
  });

  it('sends a message through AUTH PLAIN SMTP', async () => {
    const { io, writes } = scriptedIo([
      '220 smtp.gmail.com ESMTP',
      '250-smtp.gmail.com',
      '250 AUTH PLAIN LOGIN',
      '235 2.7.0 Accepted',
      '250 2.1.0 OK',
      '250 2.1.5 OK',
      '354 Go ahead',
      '250 2.0.0 OK queued as abc123xyz',
      '221 Bye',
    ]);

    const result = await smtpSendWithIo(io, {
      from: 'from@gmail.com',
      to: 'to@example.com',
      username: 'from@gmail.com',
      password: 'app-pass',
      rawMessage: 'To: to@example.com\r\nSubject: Hi\r\n\r\nHello\r\n.hidden',
    });

    expect(result.messageId).toBe('abc123xyz');
    expect(writes[0]).toBe('EHLO aiagents-hub.vn');
    expect(writes[1]).toMatch(/^AUTH PLAIN /);
    expect(writes[2]).toBe('MAIL FROM:<from@gmail.com>');
    expect(writes[3]).toBe('RCPT TO:<to@example.com>');
    expect(writes[4]).toBe('DATA');
    expect(writes[5]).toContain('..hidden');
    expect(writes[5].endsWith('\r\n.')).toBe(true);
  });

  it('surfaces SMTP auth failures', async () => {
    const { io } = scriptedIo([
      '220 smtp.gmail.com ESMTP',
      '250 AUTH PLAIN',
      '535 5.7.8 Username and Password not accepted',
    ]);

    await expect(
      smtpSendWithIo(io, {
        from: 'from@gmail.com',
        to: 'to@example.com',
        username: 'from@gmail.com',
        password: 'wrong',
        rawMessage: 'Subject: x\r\n\r\nbody',
      }),
    ).rejects.toThrow(/AUTH PLAIN failed \(535\)/);
  });
});
