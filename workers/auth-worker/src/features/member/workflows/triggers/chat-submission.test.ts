import { describe, expect, it } from 'vitest';

import { extractChatReply } from './chat-submission.js';

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
