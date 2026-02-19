import { describe, it, expect } from 'vitest';
import {
  evaluateVariant,
  findMatchingFilters,
  ProductVariant,
  FilterCriteria,
} from '../filter-engine';

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    productId: 'p1',
    skuId: null,
    displayName: 'Test Product',
    brand: null,
    listPrice: 100,
    activePrice: null,
    salePrice: null,
    bestPrice: 50,
    discountPercentage: 50,
    imageUrl: null,
    productUrl: 'https://example.com/p1',
    categories: [],
    inStock: true,
    ...overrides,
  };
}

function makeFilter(overrides: Partial<FilterCriteria> = {}): FilterCriteria {
  return {
    discountThreshold: 10,
    maxPrice: null,
    keywords: [],
    excludedCategories: [],
    ...overrides,
  };
}

describe('evaluateVariant', () => {
  describe('discount threshold (Req 7.1)', () => {
    it('qualifies when discountPercentage equals threshold', () => {
      const variant = makeVariant({ discountPercentage: 30 });
      const filter = makeFilter({ discountThreshold: 30 });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when discountPercentage exceeds threshold', () => {
      const variant = makeVariant({ discountPercentage: 50 });
      const filter = makeFilter({ discountThreshold: 30 });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('disqualifies when discountPercentage is below threshold', () => {
      const variant = makeVariant({ discountPercentage: 10 });
      const filter = makeFilter({ discountThreshold: 30 });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });
  });

  describe('max price (Req 7.2)', () => {
    it('qualifies when maxPrice is null (no limit)', () => {
      const variant = makeVariant({ bestPrice: 999 });
      const filter = makeFilter({ maxPrice: null });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when bestPrice equals maxPrice', () => {
      const variant = makeVariant({ bestPrice: 50 });
      const filter = makeFilter({ maxPrice: 50 });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when bestPrice is below maxPrice', () => {
      const variant = makeVariant({ bestPrice: 30 });
      const filter = makeFilter({ maxPrice: 50 });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('disqualifies when bestPrice exceeds maxPrice', () => {
      const variant = makeVariant({ bestPrice: 60 });
      const filter = makeFilter({ maxPrice: 50 });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });
  });

  describe('keyword matching (Req 7.3)', () => {
    it('qualifies when keywords array is empty (skip check)', () => {
      const variant = makeVariant({ displayName: 'Anything' });
      const filter = makeFilter({ keywords: [] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when product name contains a keyword (case-insensitive)', () => {
      const variant = makeVariant({ displayName: 'Nike Air Max 90' });
      const filter = makeFilter({ keywords: ['air max'] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when product name matches keyword with different casing', () => {
      const variant = makeVariant({ displayName: 'SAMSUNG Galaxy S24' });
      const filter = makeFilter({ keywords: ['samsung'] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when at least one keyword matches', () => {
      const variant = makeVariant({ displayName: 'Sony Headphones' });
      const filter = makeFilter({ keywords: ['bose', 'sony', 'jbl'] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('disqualifies when no keywords match', () => {
      const variant = makeVariant({ displayName: 'Sony Headphones' });
      const filter = makeFilter({ keywords: ['bose', 'jbl'] });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });
  });

  describe('category exclusion (Req 7.4)', () => {
    it('qualifies when excludedCategories is empty (skip check)', () => {
      const variant = makeVariant({ categories: ['Electronics'] });
      const filter = makeFilter({ excludedCategories: [] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('qualifies when variant categories do not match any excluded', () => {
      const variant = makeVariant({ categories: ['Electronics', 'Audio'] });
      const filter = makeFilter({ excludedCategories: ['Clothing', 'Food'] });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('disqualifies when a variant category matches an excluded category', () => {
      const variant = makeVariant({ categories: ['Electronics', 'Refurbished'] });
      const filter = makeFilter({ excludedCategories: ['Refurbished'] });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });

    it('disqualifies with case-insensitive category match', () => {
      const variant = makeVariant({ categories: ['ELECTRONICS'] });
      const filter = makeFilter({ excludedCategories: ['electronics'] });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });
  });

  describe('combined criteria', () => {
    it('requires all criteria to pass', () => {
      const variant = makeVariant({
        discountPercentage: 40,
        bestPrice: 30,
        displayName: 'Nike Shoes',
        categories: ['Footwear'],
      });
      const filter = makeFilter({
        discountThreshold: 30,
        maxPrice: 50,
        keywords: ['nike'],
        excludedCategories: ['Clothing'],
      });
      expect(evaluateVariant(variant, filter)).toBe(true);
    });

    it('fails if discount is below threshold even if other criteria pass', () => {
      const variant = makeVariant({
        discountPercentage: 10,
        bestPrice: 30,
        displayName: 'Nike Shoes',
        categories: ['Footwear'],
      });
      const filter = makeFilter({
        discountThreshold: 30,
        maxPrice: 50,
        keywords: ['nike'],
        excludedCategories: ['Clothing'],
      });
      expect(evaluateVariant(variant, filter)).toBe(false);
    });
  });
});

describe('findMatchingFilters (Req 7.5)', () => {
  it('returns empty array when no filters match', () => {
    const variant = makeVariant({ discountPercentage: 5 });
    const filters = [makeFilter({ discountThreshold: 20 }), makeFilter({ discountThreshold: 30 })];
    expect(findMatchingFilters(variant, filters)).toEqual([]);
  });

  it('returns matching filters only', () => {
    const variant = makeVariant({ discountPercentage: 25 });
    const f1 = makeFilter({ discountThreshold: 20 });
    const f2 = makeFilter({ discountThreshold: 30 });
    const f3 = makeFilter({ discountThreshold: 25 });
    const result = findMatchingFilters(variant, [f1, f2, f3]);
    expect(result).toEqual([f1, f3]);
  });

  it('returns all filters when all match', () => {
    const variant = makeVariant({ discountPercentage: 50 });
    const filters = [makeFilter({ discountThreshold: 10 }), makeFilter({ discountThreshold: 20 })];
    expect(findMatchingFilters(variant, filters)).toEqual(filters);
  });

  it('returns empty array for empty filters list', () => {
    const variant = makeVariant();
    expect(findMatchingFilters(variant, [])).toEqual([]);
  });
});
