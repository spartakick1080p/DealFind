import { describe, it, expect, vi } from 'vitest';

// Mock the database module so seen-tracker.ts can be imported without a real DB
vi.mock('@/db', () => ({
  db: {},
}));
vi.mock('@/db/schema', () => ({
  seenItems: {},
}));

import {
  parseNextData,
  extractProductVariants,
  isListingPage,
  isProductPage,
  getPageCount,
  type NextDataPayload,
} from '../parser';

// ---------------------------------------------------------------------------
// Helpers to build test HTML / payloads
// ---------------------------------------------------------------------------

function wrapHtml(json: object): string {
  return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(json)}</script></head><body></body></html>`;
}

function makeListingPayload(
  records: object[],
  pageCount = 1
): NextDataPayload {
  return {
    props: {
      pageProps: {
        data: {
          pageFolder: {
            dataSourceConfigurations: [
              { preloadedValue: { records, pageCount } },
            ],
          },
        },
      },
    },
  };
}

function makeProductPayload(
  gbProduct: object,
  variants?: object[]
): NextDataPayload {
  return {
    props: {
      pageProps: {
        data: {
          pageFolder: {
            dataSourceConfigurations: [
              {
                preloadedValue: {
                  product: { gbProduct, variants },
                },
              },
            ],
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// parseNextData
// ---------------------------------------------------------------------------

describe('parseNextData', () => {
  it('extracts JSON from a valid __NEXT_DATA__ script tag', () => {
    const payload = { props: { pageProps: { hello: 'world' } } };
    const html = wrapHtml(payload);
    expect(parseNextData(html)).toEqual(payload);
  });

  it('returns null when no __NEXT_DATA__ tag exists', () => {
    expect(parseNextData('<html><body>no data</body></html>')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">{bad json</script>';
    expect(parseNextData(html)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isListingPage / isProductPage
// ---------------------------------------------------------------------------

describe('isListingPage', () => {
  it('returns true for a payload with records array', () => {
    const payload = makeListingPayload([{ displayName: 'Item' }]);
    expect(isListingPage(payload)).toBe(true);
  });

  it('returns false for a product page payload', () => {
    const payload = makeProductPayload({ displayName: 'Shoe' });
    expect(isListingPage(payload)).toBe(false);
  });
});

describe('isProductPage', () => {
  it('returns true for a payload with product.gbProduct', () => {
    const payload = makeProductPayload({ displayName: 'Shoe' });
    expect(isProductPage(payload)).toBe(true);
  });

  it('returns false for a listing page payload', () => {
    const payload = makeListingPayload([]);
    expect(isProductPage(payload)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPageCount
// ---------------------------------------------------------------------------

describe('getPageCount', () => {
  it('returns the pageCount from a listing payload', () => {
    const payload = makeListingPayload([], 5);
    expect(getPageCount(payload)).toBe(5);
  });

  it('defaults to 1 when pageCount is missing', () => {
    const payload: NextDataPayload = {
      props: {
        pageProps: {
          data: {
            pageFolder: {
              dataSourceConfigurations: [{ preloadedValue: { records: [] } }],
            },
          },
        },
      },
    };
    expect(getPageCount(payload)).toBe(1);
  });

  it('defaults to 1 for an empty payload', () => {
    expect(getPageCount({})).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// extractProductVariants — listing pages
// ---------------------------------------------------------------------------

describe('extractProductVariants — listing page', () => {
  it('extracts variants from records with a variants array', () => {
    const payload = makeListingPayload([
      {
        productId: 'prod-1',
        displayName: 'Cool Shoe',
        brands: 'Nike',
        relativeUrl: '/shoes/cool-shoe',
        parentCategories: ['Footwear', 'Sale'],
        mediumImage: 'https://img.test/shoe.jpg',
        variants: [
          {
            skuId: 'sku-a',
            listPrice: 100,
            activePrice: 80,
            salePrice: 75,
            isOnStock: true,
          },
          {
            skuId: 'sku-b',
            listPrice: 100,
            activePrice: 90,
            salePrice: null,
            isOnStock: false,
          },
        ],
      },
    ]);

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(2);

    const [a, b] = variants;
    expect(a.productId).toBe('prod-1');
    expect(a.skuId).toBe('sku-a');
    expect(a.displayName).toBe('Cool Shoe');
    expect(a.brand).toBe('Nike');
    expect(a.listPrice).toBe(100);
    expect(a.activePrice).toBe(80);
    expect(a.salePrice).toBe(75);
    expect(a.bestPrice).toBe(75);
    expect(a.discountPercentage).toBe(25);
    expect(a.imageUrl).toBe('https://img.test/shoe.jpg');
    expect(a.productUrl).toBe('/shoes/cool-shoe');
    expect(a.categories).toEqual(['Footwear', 'Sale']);
    expect(a.inStock).toBe(true);
    expect(a.compositeId).toBe('prod-1:sku-a');

    expect(b.skuId).toBe('sku-b');
    expect(b.bestPrice).toBe(90);
    expect(b.inStock).toBe(false);
  });

  it('treats a record as a single variant when no variants array exists', () => {
    const payload = makeListingPayload([
      {
        productId: 'prod-solo',
        displayName: 'Solo Item',
        listPrice: 50,
        activePrice: 40,
        relativeUrl: '/solo',
      },
    ]);

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(1);
    expect(variants[0].productId).toBe('prod-solo');
    expect(variants[0].bestPrice).toBe(40);
  });

  it('skips variants with zero or missing listPrice', () => {
    const payload = makeListingPayload([
      {
        productId: 'prod-x',
        displayName: 'Bad Price',
        variants: [
          { skuId: 'ok', listPrice: 50, activePrice: 40 },
          { skuId: 'zero', listPrice: 0, activePrice: 0 },
          { skuId: 'missing' },
        ],
      },
    ]);

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(1);
    expect(variants[0].skuId).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// extractProductVariants — product pages
// ---------------------------------------------------------------------------

describe('extractProductVariants — product page', () => {
  it('extracts variants from product.gbProduct + product.variants', () => {
    const payload = makeProductPayload(
      {
        productId: 'gb-1',
        displayName: 'Great Boot',
        brands: ['Timberland'],
        relativeUrl: '/boots/great-boot',
        parentCategories: [{ displayName: 'Boots' }],
        mediumImage: 'https://img.test/boot.jpg',
      },
      [
        {
          skuId: 'v1',
          colorDescription: 'Brown',
          listPrice: 200,
          salePrice: 150,
          isOnStock: true,
          mediumImage: 'https://img.test/boot-brown.jpg',
        },
      ]
    );

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(1);

    const v = variants[0];
    expect(v.productId).toBe('gb-1');
    expect(v.skuId).toBe('v1');
    expect(v.displayName).toBe('Brown');
    expect(v.brand).toBe('Timberland');
    expect(v.bestPrice).toBe(150);
    expect(v.discountPercentage).toBe(25);
    expect(v.imageUrl).toBe('https://img.test/boot-brown.jpg');
    expect(v.categories).toEqual(['Boots']);
  });

  it('treats gbProduct as a single variant when no variants array', () => {
    const payload = makeProductPayload({
      productId: 'single',
      displayName: 'Lone Product',
      listPrice: 80,
      activePrice: 60,
      relativeUrl: '/lone',
    });
    // Remove the variants key entirely
    const pv =
      payload.props.pageProps.data.pageFolder.dataSourceConfigurations[0]
        .preloadedValue;
    delete pv.product.variants;

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(1);
    expect(variants[0].productId).toBe('single');
    expect(variants[0].bestPrice).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Money normalisation (centAmount / fractionDigits)
// ---------------------------------------------------------------------------

describe('money normalisation', () => {
  it('handles centAmount / fractionDigits money objects', () => {
    const payload = makeListingPayload([
      {
        productId: 'money-test',
        displayName: 'Cent Item',
        relativeUrl: '/cent',
        variants: [
          {
            skuId: 's1',
            listPrice: { centAmount: 9999, fractionDigits: 2 },
            activePrice: { centAmount: 7500, fractionDigits: 2 },
            salePrice: null,
          },
        ],
      },
    ]);

    const variants = extractProductVariants(payload);
    expect(variants).toHaveLength(1);
    expect(variants[0].listPrice).toBe(99.99);
    expect(variants[0].activePrice).toBe(75);
    expect(variants[0].bestPrice).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Category normalisation
// ---------------------------------------------------------------------------

describe('category normalisation', () => {
  it('handles string categories', () => {
    const payload = makeListingPayload([
      {
        productId: 'cat-str',
        displayName: 'Cat Test',
        parentCategories: 'Shoes',
        variants: [{ skuId: 's', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].categories).toEqual(['Shoes']);
  });

  it('handles array of objects with displayName', () => {
    const payload = makeListingPayload([
      {
        productId: 'cat-obj',
        displayName: 'Cat Test',
        parentCategories: [
          { displayName: 'Apparel' },
          { name: 'Sale' },
        ],
        variants: [{ skuId: 's', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].categories).toEqual([
      'Apparel',
      'Sale',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Image fallback chain
// ---------------------------------------------------------------------------

describe('image URL selection', () => {
  it('prefers variant mediumImage over product mediumImage', () => {
    const payload = makeProductPayload(
      {
        productId: 'img-test',
        displayName: 'Img',
        mediumImage: 'https://img.test/product.jpg',
      },
      [
        {
          skuId: 'v',
          listPrice: 50,
          activePrice: 40,
          mediumImage: 'https://img.test/variant.jpg',
        },
      ]
    );
    expect(extractProductVariants(payload)[0].imageUrl).toBe(
      'https://img.test/variant.jpg'
    );
  });

  it('falls back to variant imageSet', () => {
    const payload = makeProductPayload(
      { productId: 'img2', displayName: 'Img2' },
      [
        {
          skuId: 'v',
          listPrice: 50,
          activePrice: 40,
          imageSet: [{ url: 'https://img.test/set.jpg' }],
        },
      ]
    );
    expect(extractProductVariants(payload)[0].imageUrl).toBe(
      'https://img.test/set.jpg'
    );
  });

  it('falls back to product mediumImage when variant has no images', () => {
    const payload = makeProductPayload(
      {
        productId: 'img3',
        displayName: 'Img3',
        mediumImage: 'https://img.test/fallback.jpg',
      },
      [{ skuId: 'v', listPrice: 50, activePrice: 40 }]
    );
    expect(extractProductVariants(payload)[0].imageUrl).toBe(
      'https://img.test/fallback.jpg'
    );
  });

  it('returns null when no images are available', () => {
    const payload = makeProductPayload(
      { productId: 'img4', displayName: 'Img4' },
      [{ skuId: 'v', listPrice: 50, activePrice: 40 }]
    );
    expect(extractProductVariants(payload)[0].imageUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stock status
// ---------------------------------------------------------------------------

describe('stock status', () => {
  it('reads isOnStock boolean', () => {
    const payload = makeListingPayload([
      {
        productId: 'stock',
        displayName: 'Stock',
        variants: [
          { skuId: 'in', listPrice: 50, activePrice: 40, isOnStock: true },
          { skuId: 'out', listPrice: 50, activePrice: 40, isOnStock: false },
        ],
      },
    ]);
    const [inStock, outOfStock] = extractProductVariants(payload);
    expect(inStock.inStock).toBe(true);
    expect(outOfStock.inStock).toBe(false);
  });

  it('reads availability.isOnStock', () => {
    const payload = makeListingPayload([
      {
        productId: 'avail',
        displayName: 'Avail',
        variants: [
          {
            skuId: 'a',
            listPrice: 50,
            activePrice: 40,
            availability: { isOnStock: false },
          },
        ],
      },
    ]);
    expect(extractProductVariants(payload)[0].inStock).toBe(false);
  });

  it('reads stockStatus string', () => {
    const payload = makeListingPayload([
      {
        productId: 'ss',
        displayName: 'SS',
        variants: [
          {
            skuId: 'a',
            listPrice: 50,
            activePrice: 40,
            stockStatus: 'OutOfStock',
          },
        ],
      },
    ]);
    expect(extractProductVariants(payload)[0].inStock).toBe(false);
  });

  it('defaults to true when no stock info is present', () => {
    const payload = makeListingPayload([
      {
        productId: 'def',
        displayName: 'Def',
        variants: [{ skuId: 'a', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].inStock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('returns empty array for empty payload', () => {
    expect(extractProductVariants({})).toEqual([]);
  });

  it('returns empty array when preloadedValue has neither records nor product', () => {
    const payload: NextDataPayload = {
      props: {
        pageProps: {
          data: {
            pageFolder: {
              dataSourceConfigurations: [{ preloadedValue: {} }],
            },
          },
        },
      },
    };
    expect(extractProductVariants(payload)).toEqual([]);
  });

  it('bestPrice falls back to listPrice when no sale/active prices', () => {
    const payload = makeListingPayload([
      {
        productId: 'no-sale',
        displayName: 'No Sale',
        variants: [{ skuId: 'a', listPrice: 100 }],
      },
    ]);
    const v = extractProductVariants(payload)[0];
    expect(v.bestPrice).toBe(100);
    expect(v.discountPercentage).toBe(0);
  });

  it('bestPrice falls back to listPrice when sale price exceeds list price', () => {
    const payload = makeListingPayload([
      {
        productId: 'high-sale',
        displayName: 'High Sale',
        variants: [
          { skuId: 'a', listPrice: 50, activePrice: 60, salePrice: 70 },
        ],
      },
    ]);
    const v = extractProductVariants(payload)[0];
    expect(v.bestPrice).toBe(50);
    expect(v.discountPercentage).toBe(0);
  });

  it('handles brand as array of objects', () => {
    const payload = makeListingPayload([
      {
        productId: 'brand-obj',
        displayName: 'Brand Obj',
        brands: [{ displayName: 'Adidas' }],
        variants: [{ skuId: 'a', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].brand).toBe('Adidas');
  });

  it('uses repositoryId as productId fallback', () => {
    const payload = makeListingPayload([
      {
        repositoryId: 'repo-123',
        displayName: 'Repo',
        variants: [{ skuId: 'a', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].productId).toBe('repo-123');
  });

  it('uses _url as productUrl fallback', () => {
    const payload = makeListingPayload([
      {
        productId: 'url-test',
        displayName: 'URL',
        _url: '/fallback-url',
        variants: [{ skuId: 'a', listPrice: 50, activePrice: 40 }],
      },
    ]);
    expect(extractProductVariants(payload)[0].productUrl).toBe('/fallback-url');
  });
});
