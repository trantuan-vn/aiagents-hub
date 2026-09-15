import { describe, expect, it } from 'vitest';

import { extractTextFromAiResponse, finishReasonFromAiResponse, asBillingAiResponse, billGenerateTextCalls, llmUsagesFromGenerateText } from './billing.js';
import { computeUsageChargeUsd, estimateEmbeddingPromptTokens, extractUsageFromAiResponse, mergeAiUsage } from '../../../admin/service/pricing.js';

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

describe('extractUsageFromAiResponse', () => {
  it('reads Workers AI usage', () => {
    expect(
      extractUsageFromAiResponse({ usage: { prompt_tokens: 100, completion_tokens: 20 } }),
    ).toMatchObject({ prompt_tokens: 100, completion_tokens: 20 });
  });

  it('reads AI SDK usage whether wrapped or passed directly', () => {
    const sdk = { inputTokens: 20889, outputTokens: 806 };
    expect(extractUsageFromAiResponse({ usage: sdk })).toMatchObject({
      prompt_tokens: 20889,
      completion_tokens: 806,
    });
    expect(extractUsageFromAiResponse(sdk)).toMatchObject({
      prompt_tokens: 20889,
      completion_tokens: 806,
    });
  });
});

describe('computeUsageChargeUsd for LLM calls', () => {
  const glm = { priceInput: 0.06, priceOutput: 0.4, feePercent: 100 };

  it('multiplies tokens by service prices', () => {
    const cost = computeUsageChargeUsd(glm, { inputTokens: 10_000, outputTokens: 1_000 });
    expect(cost).toBeCloseTo(0.0006 + 0.0004, 8);
  });

  it('applies feePercent on top of token cost', () => {
    const cost = computeUsageChargeUsd(
      { ...glm, feePercent: 130 },
      { usage: { inputTokens: 10_000, outputTokens: 1_000 } },
    );
    expect(cost).toBeCloseTo((0.0006 + 0.0004) * 1.3, 8);
  });

  it('uses full inputTokens even when AI SDK reports cache details', () => {
    const cost = computeUsageChargeUsd(glm, {
      usage: {
        inputTokens: 20_000,
        outputTokens: 500,
        inputTokenDetails: { noCacheTokens: 5_000, cacheReadTokens: 15_000 },
      },
    });
    expect(cost).toBeCloseTo(20_000 * 0.06 / 1_000_000 + 500 * 0.4 / 1_000_000, 8);
  });
});

describe('llmUsagesFromGenerateText', () => {
  it('bills each generateText step separately', () => {
    expect(
      llmUsagesFromGenerateText({
        text: 'final',
        totalUsage: { inputTokens: 99, outputTokens: 99 },
        steps: [
          { usage: { inputTokens: 100, outputTokens: 10 }, text: 'tool' },
          { usage: { inputTokens: 200, outputTokens: 20 }, text: 'final' },
        ],
      }),
    ).toEqual([
      { usage: { inputTokens: 100, outputTokens: 10 }, text: 'tool' },
      { usage: { inputTokens: 200, outputTokens: 20 }, text: 'final' },
    ]);
  });

  it('falls back to totalUsage when steps have no usage', () => {
    expect(llmUsagesFromGenerateText({ text: 'hi', totalUsage: { inputTokens: 5, outputTokens: 1 } })).toEqual([
      { usage: { inputTokens: 5, outputTokens: 1 }, text: 'hi' },
    ]);
  });
});

describe('billGenerateTextCalls', () => {
  it('charges every step then skips a second pass', async () => {
    const billed: unknown[] = [];
    const onBill = async (usage: unknown) => {
      billed.push(usage);
    };
    const result = {
      text: 'done',
      steps: [
        { usage: { inputTokens: 1, outputTokens: 1 } },
        { usage: { inputTokens: 2, outputTokens: 2 } },
      ],
    };
    await billGenerateTextCalls(onBill, result, 0);
    expect(billed).toHaveLength(2);
    await billGenerateTextCalls(onBill, result, 2);
    expect(billed).toHaveLength(2);
  });
});

describe('asBillingAiResponse', () => {
  it('keeps usage objects and falls back to response text', () => {
    const usage = { inputTokens: 3, outputTokens: 1 };
    expect(asBillingAiResponse(usage, 'x')).toBe(usage);
    expect(asBillingAiResponse(undefined, 'hello')).toEqual({ response: 'hello' });
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
