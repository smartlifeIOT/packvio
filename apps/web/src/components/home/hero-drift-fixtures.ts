import type { CatalogImageDto, CatalogProductSummaryDto } from '@packvio/shared';

/**
 * Product fixtures for the drift specs.
 *
 * FULLY TYPED, with no cast. A `{...} as CatalogProductSummaryDto` would build
 * faster and would go on compiling after the DTO grew a field the drift needs —
 * which is precisely the change these tests exist to catch. Writing every
 * property means adding one to the API breaks this file first.
 */
export function driftProduct(
  id: string,
  options: { categorySlug?: string | null; image?: CatalogImageDto | null } = {},
): CatalogProductSummaryDto {
  const categorySlug = options.categorySlug === undefined ? 'coffee-cups' : options.categorySlug;

  return {
    id,
    // Codes are compared by substring in the loop spec, so no code may be a
    // prefix of another: `PV/1` inside `PV/14` would count as a match and make
    // a passing assertion meaningless.
    code: `PV/${id}/`,
    name: `Product ${id}`,
    slug: `product-${id}`,
    alternateSlug: `product-${id}-alt`,
    locale: 'en',
    shortDescription: null,
    size: null,
    material: null,
    caseQuantity: null,
    price: null,
    salePrice: null,
    currency: 'SAR',
    status: 'active',
    fulfilmentMode: 'quote',
    isFeatured: false,
    supportsCustomPrinting: true,
    primaryCategory:
      categorySlug === null
        ? null
        : {
            id: `cat-${categorySlug}`,
            name: categorySlug,
            slug: categorySlug,
            alternateSlug: `${categorySlug}-alt`,
            locale: 'en',
          },
    primaryImage: options.image ?? null,
    /**
     * The drift is ornament: it shows one tile per product and never offers a
     * choice, so a family is irrelevant to it. Null here is the shape a
     * product with no siblings has anyway — 41 of 213 — so the specs still
     * exercise a real case rather than a contrived one.
     */
    variantGroup: null,
  };
}

/**
 * `n` products, each in its own category — the interleaved happy path.
 *
 * Ids are zero-padded so `PV/1/` and `PV/10/` are not prefixes of each other;
 * the loop spec counts code occurrences in the rendered markup.
 */
export function driftProducts(n: number): CatalogProductSummaryDto[] {
  return Array.from({ length: n }, (_, i) => {
    const id = String(i).padStart(2, '0');
    return driftProduct(id, { categorySlug: `cat-${id}` });
  });
}
