import { describe, expect, it } from 'vitest';

import { extractChatReply } from './chat-reply.js';

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
});
