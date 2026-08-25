import { describe, expect, it } from 'vitest';

import { extractTextFromAiResponse, finishReasonFromAiResponse } from './billing.js';

describe('extractTextFromAiResponse', () => {
  it('reads Workers AI response string', () => {
    expect(extractTextFromAiResponse({ response: 'hello' })).toBe('hello');
  });

  it('reads OpenAI-style message content', () => {
    expect(
      extractTextFromAiResponse({
        choices: [{ message: { role: 'assistant', content: '```sql\nSELECT 1\n```' } }],
      }),
    ).toBe('```sql\nSELECT 1\n```');
  });

  it('falls back to reasoning when content is null', () => {
    expect(
      extractTextFromAiResponse({
        choices: [
          {
            finish_reason: 'length',
            message: {
              role: 'assistant',
              content: null,
              reasoning: 'Drafting SELECT * FROM ADMIN.ORDERS',
            },
          },
        ],
      }),
    ).toBe('Drafting SELECT * FROM ADMIN.ORDERS');
  });

  it('does not stringify the raw completion JSON', () => {
    expect(
      extractTextFromAiResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: null } }],
      }),
    ).toBe('');
  });
});

describe('finishReasonFromAiResponse', () => {
  it('reads finish_reason from the first choice', () => {
    expect(
      finishReasonFromAiResponse({
        choices: [{ finish_reason: 'length', message: { content: null } }],
      }),
    ).toBe('length');
  });
});
