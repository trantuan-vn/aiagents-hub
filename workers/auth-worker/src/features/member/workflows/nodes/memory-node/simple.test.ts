import { describe, expect, it } from 'vitest';

import {
  clampContextWindow,
  clipMemoryWindow,
  formatSimpleMemoryHistory,
  parseSimpleMemoryMessages,
  resolveSimpleMemorySessionId,
  simpleMemoryKey,
} from './simple.js';

describe('simple memory window', () => {
  it('clips to the last N user/assistant interactions', () => {
    const messages = [
      { role: 'user' as const, content: 'u1' },
      { role: 'assistant' as const, content: 'a1' },
      { role: 'user' as const, content: 'u2' },
      { role: 'assistant' as const, content: 'a2' },
      { role: 'user' as const, content: 'u3' },
      { role: 'assistant' as const, content: 'a3' },
    ];
    expect(clipMemoryWindow(messages, 2)).toEqual(messages.slice(2));
    expect(clampContextWindow(0)).toBe(1);
    expect(clampContextWindow(200)).toBe(99);
  });

  it('parses stored JSON and formats history', () => {
    const parsed = parseSimpleMemoryMessages(
      JSON.stringify([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]),
    );
    expect(parsed).toHaveLength(2);
    expect(formatSimpleMemoryHistory(parsed)).toBe('User: hi\nAssistant: hello');
  });
});

describe('simple memory session id', () => {
  it('builds a stable key scoped to the memory node', () => {
    expect(simpleMemoryKey(9, 'abc', 'mem_1')).toBe('9:abc:mem_1');
  });

  it('reads sessionId from chat trigger output', () => {
    expect(
      resolveSimpleMemorySessionId({
        sessionIdSource: 'from_chat_trigger',
        sessionKey: '{{ $json.sessionId }}',
        input: { sessionId: 'chat-1', chatInput: 'hi' },
      }),
    ).toBe('chat-1');
  });

  it('uses the interpolated key when define_below is selected', () => {
    expect(
      resolveSimpleMemorySessionId({
        sessionIdSource: 'define_below',
        sessionKey: '{{ $json.custom }}',
        input: { sessionId: 'ignored', custom: 'shared-key' },
      }),
    ).toBe('shared-key');
  });
});
