import { describe, expect, it } from 'vitest';

import {
  contributionPct,
  dualFromCredits,
  dualFromUsd,
  dualHybrid,
  economicsWindow,
  hubNetUsd,
  normalizeEconomicsEmail,
  parseEconomicsHours,
  preferCredits,
} from './user-economics.js';

const PRICE = 0.0077;

describe('user economics helpers', () => {
  it('normalizes email and parses hours', () => {
    expect(normalizeEconomicsEmail('  Ada@Hub.VN ')).toBe('ada@hub.vn');
    expect(parseEconomicsHours(undefined)).toBe(720);
    expect(parseEconomicsHours('all')).toBe(0);
    expect(parseEconomicsHours('0')).toBe(0);
    expect(parseEconomicsHours('24')).toBe(24);
    expect(parseEconomicsHours('9999999')).toBe(24 * 365 * 5);
  });

  it('converts USD and credits both ways at creditPriceUsd', () => {
    expect(dualFromUsd(7.7, PRICE)).toEqual({ usd: 7.7, credits: 1000 });
    expect(dualFromCredits(1000, PRICE).credits).toBe(1000);
    expect(dualFromCredits(1000, PRICE).usd).toBeCloseTo(7.7, 6);
  });

  it('keeps both ledgers in dualHybrid and fills the missing side', () => {
    expect(dualHybrid(7.7, 1000, PRICE)).toEqual({ usd: 7.7, credits: 1000 });
    expect(dualHybrid(7.7, 0, PRICE).credits).toBe(1000);
    expect(dualHybrid(0, 1000, PRICE).usd).toBeCloseTo(7.7, 6);
    expect(preferCredits(1000, 1, PRICE).credits).toBe(1000);
    expect(preferCredits(0, 7.7, PRICE).credits).toBe(1000);
  });

  it('nets Hub contribution after referral commission', () => {
    expect(hubNetUsd(10, 2.5)).toBe(7.5);
    expect(hubNetUsd(1, 2.5)).toBe(-1.5);
    expect(dualFromUsd(-7.7, PRICE).usd).toBe(-7.7);
    expect(dualFromUsd(-7.7, PRICE).credits).toBe(-1000);
    expect(contributionPct(5, 10)).toBe(50);
    expect(contributionPct(1, 0)).toBe(0);
  });

  it('groups long windows by month', () => {
    const short = economicsWindow(24, 1_000_000);
    expect(short.groupBy).toBe('day');
    expect(short.fromMs).toBe(1_000_000 - 24 * 60 * 60 * 1000);
    expect(economicsWindow(0, 1_000_000).fromMs).toBe(0);
    expect(economicsWindow(0, 1_000_000).groupBy).toBe('month');
    expect(economicsWindow(91 * 24, 1_000_000).groupBy).toBe('month');
  });
});
