import { describe, it, expect } from 'vitest';
import { pickBestPrice, computeDiscount } from '../discount';

describe('pickBestPrice', () => {
  it('returns null when both prices are null', () => {
    expect(pickBestPrice(null, null)).toBeNull();
  });

  it('returns activePrice when salePrice is null', () => {
    expect(pickBestPrice(49.99, null)).toBe(49.99);
  });

  it('returns salePrice when activePrice is null', () => {
    expect(pickBestPrice(null, 39.99)).toBe(39.99);
  });

  it('returns the lower price when both are present', () => {
    expect(pickBestPrice(50, 40)).toBe(40);
    expect(pickBestPrice(30, 60)).toBe(30);
  });

  it('returns either when both prices are equal', () => {
    expect(pickBestPrice(25, 25)).toBe(25);
  });

  it('handles zero prices', () => {
    expect(pickBestPrice(0, 10)).toBe(0);
    expect(pickBestPrice(10, 0)).toBe(0);
    expect(pickBestPrice(0, 0)).toBe(0);
  });
});

describe('computeDiscount', () => {
  it('computes a standard discount', () => {
    // ((100 - 75) / 100) * 100 = 25
    expect(computeDiscount(100, 75)).toBe(25);
  });

  it('computes 50% discount', () => {
    expect(computeDiscount(200, 100)).toBe(50);
  });

  it('returns 0 when bestPrice equals listPrice', () => {
    expect(computeDiscount(100, 100)).toBe(0);
  });

  it('returns negative discount when bestPrice exceeds listPrice', () => {
    // ((100 - 120) / 100) * 100 = -20
    expect(computeDiscount(100, 120)).toBe(-20);
  });

  it('returns 100 when bestPrice is 0 (free)', () => {
    expect(computeDiscount(50, 0)).toBe(100);
  });

  it('rounds to two decimal places', () => {
    // ((100 - 67) / 100) * 100 = 33
    expect(computeDiscount(100, 67)).toBe(33);
    // ((3 - 1) / 3) * 100 = 66.666... → 66.67
    expect(computeDiscount(3, 1)).toBe(66.67);
  });

  it('handles small fractional prices', () => {
    // ((9.99 - 7.49) / 9.99) * 100 = 25.025... → 25.03
    expect(computeDiscount(9.99, 7.49)).toBe(25.03);
  });
});
