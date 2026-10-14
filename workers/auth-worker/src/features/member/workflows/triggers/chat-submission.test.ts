import { describe, expect, it } from 'vitest';

import { extractChatReply, shouldPauseChatForClarification } from './chat-reply.js';
import { parseChatMessageRequest, redactChatSecrets } from './chat-message.js';

describe('extractChatReply', () => {
  it('uses the last node text instead of echoing the chat trigger payload', () => {
    expect(
      extractChatReply({
        output: {
          triggerKind: 'chat',
          chatInput: 'hello',
          action: 'sendMessage',
          text: 'Invoice total is 120',
        },
      }),
    ).toBe('Invoice total is 120');
  });

  it('walks previous steps when the last output is only the chat trigger echo', () => {
    expect(
      extractChatReply({
        output: {
          triggerKind: 'chat',
          sessionId: 'abc',
          action: 'sendMessage',
          chatInput: 'hello',
          query: 'hello',
          text: 'hello',
        },
        steps: [
          { output: { triggerKind: 'chat', chatInput: 'hello', action: 'sendMessage', text: 'hello' } },
          { output: { text: 'Done' } },
        ],
      }),
    ).toBe('Done');
  });

  it('shows SQL or the question instead of the reasoning node object', () => {
    expect(
      extractChatReply({
        output: {
          status: 'ok',
          text: 'SELECT id FROM orders;',
          sql: 'SELECT id FROM orders;',
          citations: [{ id: 1 }],
          snippets: ['schema'],
        },
      }),
    ).toBe('SELECT id FROM orders;');
    expect(
      extractChatReply({
        output: {
          status: 'needs_clarification',
          text: 'Bạn muốn tháng nào?',
          questions: ['Bạn muốn tháng nào?'],
          citations: [],
        },
      }),
    ).toBe('Bạn muốn tháng nào?');
  });

  it('shows the agent SQL when the last node is an HTTP echo of that SQL', () => {
    const sql = 'SELECT ND.MA_NDT FROM ADMIN.TAI_KHOAN ND WHERE ND.TRANG_THAI = \'ACTIVE\';';
    expect(
      extractChatReply({
        output: {
          ok: true,
          echo: true,
          local: true,
          method: 'POST',
          body: { sql },
          text: JSON.stringify({ ok: true, echo: true, body: { sql } }),
        },
        steps: [
          { output: { triggerKind: 'chat', action: 'sendMessage', chatInput: 'liệt kê số dư', text: 'liệt kê số dư' } },
          {
            output: {
              status: 'ok',
              text: sql,
              sql,
              artifact: sql,
              citations: [],
            },
          },
        ],
      }),
    ).toBe(sql);
  });

  it('unwraps SQL from an HTTP echo when the agent step is missing', () => {
    const sql = 'SELECT id FROM orders;';
    expect(
      extractChatReply({
        output: {
          ok: true,
          echo: true,
          local: true,
          method: 'POST',
          data: { sql },
          text: JSON.stringify({ ok: true, echo: true, data: { sql } }),
        },
      }),
    ).toBe(sql);
  });

  it('shows the final node SQL when the agent step text was clipped to an ellipsis', () => {
    const sql =
      "SELECT ND.MA_NDT, ND.HO_TEN FROM ADMIN.TAI_KHOAN ND WHERE ND.TRANG_THAI = 'ACTIVE';";
    expect(
      extractChatReply({
        output: {
          ok: true,
          echo: true,
          local: true,
          method: 'POST',
          data: { sql },
          body: { sql },
          text: JSON.stringify({ ok: true, echo: true, data: { sql } }),
        },
        steps: [{ output: { status: 'ok', text: '…', sql: '…' } }],
      }),
    ).toBe(sql);
  });

  it('returns empty when the workflow only echoed the chat trigger', () => {
    expect(
      extractChatReply({
        output: {
          triggerKind: 'chat',
          action: 'sendMessage',
          chatInput: 'hello',
          text: 'hello',
        },
      }),
    ).toBe('');
  });

  it('pauses a chat run when the agent still needs an answer', () => {
    expect(shouldPauseChatForClarification({ triggerKind: 'chat' }, { status: 'needs_clarification' })).toBe(true);
    expect(shouldPauseChatForClarification({ triggerKind: 'chat' }, { status: 'ok', sql: 'SELECT 1;' })).toBe(false);
    expect(shouldPauseChatForClarification({ triggerKind: 'manual' }, { status: 'needs_clarification' })).toBe(false);
  });
});

describe('parseChatMessageRequest', () => {
  it('redacts a card number and a labeled one-time code', () => {
    expect(redactChatSecrets('card 4242424242424242')).toBe('card [redacted]');
    expect(redactChatSecrets('otp is 123456')).toBe('otp is [redacted]');
    expect(redactChatSecrets('password: hunter2')).toBe('password [redacted]');
    expect(redactChatSecrets('how do I reset my password?')).toBe('how do I reset my password?');
  });

  it('rejects an oversized message and a session id with separators', () => {
    const long = parseChatMessageRequest({ chatInput: 'a'.repeat(1001), sessionId: '11111111-1111-1111-1111-111111111111' });
    expect(long.tooLong).toBe(true);
    expect(long.chatInput).toBe('');

    const session = parseChatMessageRequest({ chatInput: 'hello', sessionId: 'not a session' });
    expect(session.invalidSession).toBe(true);

    const ok = parseChatMessageRequest({ chatInput: 'hello', sessionId: '11111111-1111-1111-1111-111111111111' });
    expect(ok.invalidSession).toBe(false);
    expect(ok.chatInput).toBe('hello');
  });
});
