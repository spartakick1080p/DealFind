/**
 * Canonical category definitions with alias mappings.
 *
 * Each broad category has a list of aliases that map to how different
 * websites label their categories. The filter engine uses these aliases
 * to fuzzy-match a product's raw categories against the user's selection.
 *
 * Matching is case-insensitive and uses substring containment — so the
 * alias "electronic" will match "Electronics", "Consumer Electronics",
 * "Electronics & Gadgets", etc.
 */

export interface CategoryDefinition {
  /** Display label shown in the UI dropdown */
  label: string;
  /** Stable key stored in the DB */
  value: string;
  /** Lowercase substrings that match raw product categories from websites */
  aliases: string[];
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    label: 'Electronics',
    value: 'electronics',
    aliases: ['electronic', 'computer', 'laptop', 'tablet', 'phone', 'tv', 'television', 'audio', 'video', 'camera', 'gaming', 'console', 'smart home', 'wearable'],
  },
  {
    label: 'Clothing & Apparel',
    value: 'clothing',
    aliases: ['clothing', 'apparel', 'fashion', 'men\'s', 'women\'s', 'kids\'', 'shirts', 'pants', 'dresses', 'outerwear', 'uniforms', 'activewear'],
  },
  {
    label: 'Shoes & Footwear',
    value: 'shoes',
    aliases: ['shoe', 'footwear', 'sneaker', 'boot', 'sandal', 'slipper'],
  },
  {
    label: 'Sports & Outdoors',
    value: 'sports',
    aliases: ['sport', 'outdoor', 'fitness', 'exercise', 'camping', 'hiking', 'hunting', 'fishing', 'athletic', 'recreation'],
  },
  {
    label: 'Home & Garden',
    value: 'home',
    aliases: ['home', 'garden', 'furniture', 'kitchen', 'bedding', 'bath', 'decor', 'patio', 'lawn', 'appliance', 'housewares'],
  },
  {
    label: 'Health & Beauty',
    value: 'health',
    aliases: ['health', 'beauty', 'personal care', 'skincare', 'makeup', 'cosmetic', 'fragrance', 'vitamin', 'supplement', 'wellness', 'grooming'],
  },
  {
    label: 'Toys & Games',
    value: 'toys',
    aliases: ['toy', 'game', 'puzzle', 'lego', 'action figure', 'doll', 'board game', 'play'],
  },
  {
    label: 'Food & Grocery',
    value: 'food',
    aliases: ['food', 'grocery', 'snack', 'beverage', 'drink', 'candy', 'gourmet'],
  },
  {
    label: 'Automotive',
    value: 'automotive',
    aliases: ['auto', 'car', 'vehicle', 'motor', 'tire', 'automotive'],
  },
  {
    label: 'Baby & Kids',
    value: 'baby',
    aliases: ['baby', 'infant', 'toddler', 'nursery', 'kids', 'children'],
  },
  {
    label: 'Pet Supplies',
    value: 'pets',
    aliases: ['pet', 'dog', 'cat', 'animal'],
  },
  {
    label: 'Office & School',
    value: 'office',
    aliases: ['office', 'school', 'stationery', 'supplies', 'desk'],
  },
  {
    label: 'Jewelry & Watches',
    value: 'jewelry',
    aliases: ['jewelry', 'jewellery', 'watch', 'ring', 'necklace', 'bracelet'],
  },
  {
    label: 'Luggage & Travel',
    value: 'luggage',
    aliases: ['luggage', 'travel', 'suitcase', 'backpack', 'bag'],
  },
];

/**
 * Given a list of canonical category values (e.g. ['electronics', 'sports'])
 * and a product's raw category strings, return true if the product matches
 * at least one of the canonical categories.
 *
 * Matching: for each canonical category, check if any of its aliases appear
 * as a substring (case-insensitive) in any of the product's raw categories.
 */
export function matchesAnyCategory(
  canonicalValues: string[],
  productCategories: string[],
): boolean {
  if (canonicalValues.length === 0) return true; // no filter = match all
  if (productCategories.length === 0) return false; // no categories on product = can't match

  const productLower = productCategories.map((c) => c.toLowerCase());

  for (const val of canonicalValues) {
    const def = CATEGORIES.find((c) => c.value === val);
    if (!def) continue;

    const matched = def.aliases.some((alias) =>
      productLower.some((pc) => pc.includes(alias)),
    );
    if (matched) return true;
  }

  return false;
}

/**
 * Given a list of canonical category values to exclude and a product's raw
 * category strings, return true if the product matches ANY excluded category
 * (i.e. should be filtered out).
 */
export function matchesAnyExcludedCategory(
  excludedValues: string[],
  productCategories: string[],
): boolean {
  if (excludedValues.length === 0) return false;
  return matchesAnyCategory(excludedValues, productCategories);
}
