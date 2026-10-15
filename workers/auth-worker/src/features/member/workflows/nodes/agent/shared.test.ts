import { describe, expect, it } from 'vitest';

import { resolveMaxReasoningMs } from './shared.js';

describe('resolveMaxReasoningMs', () => {
  it('converts a tools_agent seconds budget into a clamped millisecond cap', () => {
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 12 })).toBe(12_000);
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: '8' })).toBe(8_000);
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 1 })).toBe(3_000);
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 500 })).toBe(120_000);
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 15.9 })).toBe(15_000);
  });

  it('leaves the model uncapped when the field is empty or zero', () => {
    expect(resolveMaxReasoningMs({})).toBeUndefined();
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: '' })).toBeUndefined();
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 0 })).toBeUndefined();
    expect(resolveMaxReasoningMs({ maxReasoningSeconds: 'soon' })).toBeUndefined();
  });
});
