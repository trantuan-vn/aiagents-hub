import { describe, expect, it } from 'vitest';

import { extractTextFromAiResponse, finishReasonFromAiResponse } from './billing.js';
import { computeUsageChargeUsd, estimateEmbeddingPromptTokens, mergeAiUsage } from '../../../admin/service/pricing.js';

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

describe('estimateEmbeddingPromptTokens', () => {
  it('counts at least one token per non-empty string', () => {
    expect(estimateEmbeddingPromptTokens(['hi'])).toBe(1);
    expect(estimateEmbeddingPromptTokens(['', '  '])).toBe(0);
  });

  it('estimates ~1 token per 4 characters', () => {
    expect(estimateEmbeddingPromptTokens(['a'.repeat(8)])).toBe(2);
    expect(estimateEmbeddingPromptTokens(['what is RAG?'])).toBe(3);
  });
});

describe('computeUsageChargeUsd for embeddings', () => {
  it('charges input tokens only when output price is 0', () => {
    const cost = computeUsageChargeUsd(
      { priceInput: 0.067, priceOutput: 0, feePercent: 100 },
      { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } },
    );
    expect(cost).toBeCloseTo(0.067, 8);
  });
});

describe('mergeAiUsage', () => {
  it('sums tokens and neurons across embed batches', () => {
    const merged = mergeAiUsage(
      { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10, neurons: 0.2 },
      { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5, neurons: 0.1, prompt_tokens_details: { cached_tokens: 0 } },
    );
    expect(merged).toMatchObject({
      prompt_tokens: 15,
      completion_tokens: 0,
      total_tokens: 15,
      neurons: 0.3,
      prompt_tokens_details: { cached_tokens: 0 },
    });
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
