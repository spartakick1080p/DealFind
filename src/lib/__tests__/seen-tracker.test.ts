import { describe, it, expect, vi } from 'vitest';

// Mock the db module to avoid needing DATABASE_URL for pure function tests
vi.mock('@/db', () => ({
  db: {},
}));

import { computeCompositeId } from '../seen-tracker';

describe('computeCompositeId', () => {
  it('returns "productId:skuId" when skuId is present', () => {
    expect(computeCompositeId('prod-123', 'sku-456')).toBe('prod-123:sku-456');
  });

  it('returns "productId" when skuId is null', () => {
    expect(computeCompositeId('prod-123', null)).toBe('prod-123');
  });

  it('returns "productId" when skuId is empty string', () => {
    expect(computeCompositeId('prod-123', '')).toBe('prod-123');
  });

  it('handles numeric-like IDs', () => {
    expect(computeCompositeId('12345', '67890')).toBe('12345:67890');
  });

  it('handles skuId with special characters', () => {
    expect(computeCompositeId('prod-1', 'sku/variant:2')).toBe('prod-1:sku/variant:2');
  });

  it('handles productId with no skuId (null)', () => {
    expect(computeCompositeId('single-product', null)).toBe('single-product');
  });
});
