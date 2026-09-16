import { describe, expect, it } from 'vitest';

import {
  billingEconomicsFromConfig,
  classifyModelClass,
  coeffPerMillion,
  computeUsageCredits,
  creditsToUsd,
  proposeCreditCoeffs,
  usdToCredits,
  vndToCredits,
} from './credit.js';

const eco = billingEconomicsFromConfig();

describe('credit conversion', () => {
  it('converts USD and VND at the frozen credit price', () => {
    expect(usdToCredits(7.7, 0.0077)).toBe(1000);
    expect(creditsToUsd(1000, 0.0077)).toBeCloseTo(7.7, 6);
    expect(vndToCredits(0.0077 * 26_000 * 1000, 26_000, 0.0077)).toBe(1000);
  });
});

describe('classifyModelClass', () => {
  it('treats cheap Workers AI as tiny and GPT-4 as frontier', () => {
    expect(classifyModelClass({ model: '@cf/meta/llama-3.1-8b-instruct', priceInput: 0.067 })).toBe('tiny');
    expect(classifyModelClass({ model: 'openai/gpt-4o', priceInput: 2.5 })).toBe('frontier');
    expect(classifyModelClass({ model: 'openai/gpt-4.1-mini', priceInput: 0.4 })).toBe('mid');
  });
});

describe('coeff and usage credits', () => {
  it('matches the spec tiny Llama example (~28 CR / 1M input)', () => {
    const coeff = coeffPerMillion(0.067, 'tiny', eco);
    expect(coeff).toBeCloseTo(28.2, 0);
  });

  it('charges fewer credits on tiny than on frontier for the same tokens', () => {
    const usage = { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } };
    const tiny = computeUsageCredits(
      { model: '@cf/meta/llama-3.1-8b-instruct', priceInput: 0.067, priceOutput: 0 },
      usage,
      eco,
    );
    const frontier = computeUsageCredits(
      { model: 'openai/gpt-4o', priceInput: 2.5, priceOutput: 10 },
      usage,
      eco,
    );
    expect(tiny.modelClass).toBe('tiny');
    expect(frontier.modelClass).toBe('frontier');
    expect(frontier.creditsUsage).toBeGreaterThan(tiny.creditsUsage * 10);
    expect(tiny.contributionPct).toBeGreaterThan(frontier.contributionPct);
    expect(tiny.cogsAiUsd).toBeCloseTo(0.067, 8);
  });

  it('does not apply feePercent as a customer markup', () => {
    const usage = { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } };
    const a = computeUsageCredits({ priceInput: 0.067, priceOutput: 0, feePercent: 100 }, usage, eco);
    const b = computeUsageCredits({ priceInput: 0.067, priceOutput: 0, feePercent: 200 }, usage, eco);
    expect(a.creditsUsage).toBe(b.creditsUsage);
  });

  it('uses stored credit coefficients when present', () => {
    const billed = computeUsageCredits(
      { priceInput: 0.067, priceOutput: 0, creditCoeffInput: 10, creditCoeffOutput: 0 },
      { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } },
      eco,
    );
    expect(billed.creditsUsage).toBe(10);
  });
});

describe('proposeCreditCoeffs', () => {
  it('marks emergency when observed contribution is negative', () => {
    const proposal = proposeCreditCoeffs({
      pricing: { priceInput: 2.5, priceOutput: 10 },
      modelClass: 'frontier',
      eco,
      observedContributionPct: -4,
    });
    expect(proposal.emergency).toBe(true);
    expect(proposal.leadDaysPro).toBe(0);
    expect(proposal.proposed.input).toBeGreaterThan(0);
  });

  it('proposes higher coeffs when COGS rises vs stored rates', () => {
    const current = { input: 10, output: 20, inputCache: 0 };
    const proposal = proposeCreditCoeffs({
      pricing: { priceInput: 2.5, priceOutput: 10 },
      modelClass: 'frontier',
      eco,
      current,
      observedContributionPct: 10,
    });
    expect(proposal.proposed.input).toBeGreaterThan(current.input);
    expect(proposal.notify).toBe(true);
  });
});
