import { describe, expect, it } from 'vitest';

import { usageRowsToCredits } from './infrastructure';

describe('usageRowsToCredits', () => {
  it('keeps recorded Credits and converts leftover USD at the credit price', () => {
    expect(usageRowsToCredits(10, 0, 0.0077)).toBe(10);
    expect(usageRowsToCredits(0, 7.7, 0.0077)).toBe(1000);
    expect(usageRowsToCredits(10, 7.7, 0.0077)).toBe(1010);
  });

  it('treats missing amounts as zero', () => {
    expect(usageRowsToCredits(0, 0, 0.0077)).toBe(0);
  });
});
