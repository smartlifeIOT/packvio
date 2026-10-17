import {
  dealIntoColumns,
  hasEnoughForDrift,
  MAX_DRIFT_PRODUCTS,
  MIN_DRIFT_PRODUCTS,
  selectDriftProducts,
} from './hero-drift-data';
import { driftProduct, driftProducts } from './hero-drift-fixtures';

/**
 * The drift's selection layer.
 *
 * These cover the rules a reader can actually see fail: a column of six
 * identical icons, the same product twice inside one loop, or — the one this
 * feature must never do — a half-built decoration in a hero that should have
 * degraded to its previous layout.
 */

describe('selectDriftProducts', () => {
  it('dedupes across sources, keeping the first occurrence', () => {
    // `featured` and `newest` overlap in practice: a newly seeded product that
    // is also flagged appears in both arrays of the same /catalog/home payload.
    const shared = driftProduct('a');
    const selected = selectDriftProducts(
      [shared, driftProduct('b', { categorySlug: 'lids' })],
      [shared, driftProduct('c', { categorySlug: 'straws' })],
    );

    expect(selected.map((product) => product.id)).toEqual(['a', 'b', 'c']);
  });

  it('caps at MAX_DRIFT_PRODUCTS', () => {
    expect(selectDriftProducts(driftProducts(40))).toHaveLength(MAX_DRIFT_PRODUCTS);
  });

  it('never places two products of the same category next to each other when it can avoid it', () => {
    // Grouped input is the worst case for a naive pass and the shape the API
    // actually returns — /catalog/home orders by sortOrder, which clusters a
    // family together.
    const grouped = [
      ...Array.from({ length: 4 }, (_, i) => driftProduct(`cup-${i}`, { categorySlug: 'cups' })),
      ...Array.from({ length: 4 }, (_, i) => driftProduct(`lid-${i}`, { categorySlug: 'lids' })),
      ...Array.from({ length: 4 }, (_, i) => driftProduct(`straw-${i}`, { categorySlug: 'straws' })),
    ];

    const slugs = selectDriftProducts(grouped).map((product) => product.primaryCategory?.slug);

    expect(slugs).toHaveLength(12);
    for (let i = 1; i < slugs.length; i += 1) {
      expect(slugs[i]).not.toBe(slugs[i - 1]);
    }
  });

  it('keeps every product when only one category exists, rather than dropping to preserve the rule', () => {
    // A shorter loop is a worse outcome than two similar neighbours, so the
    // greedy pass gives up on variety before it gives up on material.
    const single = Array.from({ length: 8 }, (_, i) =>
      driftProduct(String(i), { categorySlug: 'cups' }),
    );

    expect(selectDriftProducts(single)).toHaveLength(8);
  });

  it('treats uncategorised products as one bucket rather than crashing', () => {
    const selected = selectDriftProducts([
      driftProduct('a', { categorySlug: null }),
      driftProduct('b', { categorySlug: null }),
      driftProduct('c', { categorySlug: 'lids' }),
    ]);

    expect(selected).toHaveLength(3);
  });

  it('returns an empty array when every source is empty', () => {
    expect(selectDriftProducts([], [])).toEqual([]);
  });
});

describe('dealIntoColumns', () => {
  it('deals round-robin when every category differs', () => {
    const columns = dealIntoColumns(driftProducts(6), 3);

    expect(columns.map((column) => column.map((product) => product.id))).toEqual([
      ['00', '03'],
      ['01', '04'],
      ['02', '05'],
    ]);
  });

  it('never stacks two of a category in one column, even from a perfect interleave', () => {
    // A B C A B C over exactly three categories is the pathological input: a
    // plain round-robin deal turns the best possible order into one column of
    // A, one of B and one of C.
    const interleaved = Array.from({ length: 12 }, (_, i) =>
      driftProduct(String(i), { categorySlug: ['cups', 'lids', 'straws'][i % 3] }),
    );

    for (const column of dealIntoColumns(interleaved, 3)) {
      const slugs = column.map((product) => product.primaryCategory?.slug);
      for (let i = 1; i < slugs.length; i += 1) {
        expect(slugs[i]).not.toBe(slugs[i - 1]);
      }
    }
  });

  it('places every product even when it has to break the rule to do it', () => {
    // One category only: there is no arrangement that satisfies the rule, and
    // dropping tiles to preserve it would shorten the loop.
    const single = Array.from({ length: 9 }, (_, i) =>
      driftProduct(String(i), { categorySlug: 'cups' }),
    );
    const columns = dealIntoColumns(single, 3);

    expect(columns.flat()).toHaveLength(9);
  });

  it('returns columns within one tile of each other in length', () => {
    // Wildly uneven columns would finish their cycles at obviously different
    // moments and read as three separate animations.
    const lengths = dealIntoColumns(driftProducts(17), 3).map((column) => column.length);

    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
  });

  it('drops empty columns rather than rendering one', () => {
    // Two products across three columns would otherwise leave a bare animating
    // strip where the third column should be.
    expect(dealIntoColumns(driftProducts(2), 3)).toHaveLength(2);
  });
});

describe('hasEnoughForDrift', () => {
  it('is false for no data at all — the fetch-failed and nothing-featured paths', () => {
    expect(hasEnoughForDrift([])).toBe(false);
  });

  it('is false just below the minimum', () => {
    expect(hasEnoughForDrift(driftProducts(MIN_DRIFT_PRODUCTS - 1))).toBe(false);
  });

  it('is true at the minimum', () => {
    expect(hasEnoughForDrift(driftProducts(MIN_DRIFT_PRODUCTS))).toBe(true);
  });
});
