/**
 * Compile-time proof that apps/web consumes the API's response contract from
 * @packvio/shared rather than redeclaring it. If the API changes a DTO and this
 * file still compiles, the shared package is doing its job.
 */
import type {
  CatalogCategoryDto,
  CatalogHomeDto,
  CatalogProductDetailDto,
  CatalogProductSummaryDto,
  PaginatedResponse,
} from '@packvio/shared';

export type ProductGrid = PaginatedResponse<CatalogProductSummaryDto>;

export function productHref(product: CatalogProductDetailDto | CatalogProductSummaryDto, locale: 'ar' | 'en'): string {
  return `/${locale}/products/${product.slug}`;
}

/** The language switcher's whole reason for needing alternateSlug. */
export function switchLocaleHref(product: CatalogProductDetailDto, to: 'ar' | 'en'): string {
  return `/${to}/products/${product.alternateSlug}`;
}

export function categoryTileCount(category: CatalogCategoryDto): number {
  return category.productCount;
}

export function homeStats(home: CatalogHomeDto): string {
  return `${home.stats.productCount} products across ${home.stats.categoryCount} categories`;
}
