import { describe, expect, it } from 'vitest';

import { toMemberServiceDto } from './member-dto.js';

describe('toMemberServiceDto', () => {
  it('hides token prices and feePercent from members', () => {
    const dto = toMemberServiceDto({
      id: 1,
      name: 'Vision',
      endpoint: '/api/ai/x',
      model: '@cf/meta/llama-3.1-8b-instruct',
      priceInput: 0.067,
      priceOutput: 0,
      feePercent: 130,
      modelClass: 'tiny',
      creditCoeffInput: 28,
      creditCoeffOutput: 0,
    });
    expect(dto.priceInput).toBeUndefined();
    expect(dto.feePercent).toBeUndefined();
    expect(dto.creditCoeffInput).toBeUndefined();
    expect(dto.modelClass).toBeUndefined();
    expect(dto.name).toBe('Vision');
    expect(dto.estimatedCreditsPerRun).toBeGreaterThan(0);
    expect(dto.modelFamily).toBeUndefined();
  });

  it('adds model family for Enterprise', () => {
    const dto = toMemberServiceDto(
      { name: 'GPT', model: 'openai/gpt-4o', priceInput: 2.5, priceOutput: 10 },
      { enterprise: true },
    );
    expect(dto.modelFamily).toBe('GPT');
  });
});
