import { notFound } from 'next/navigation';
import type {
  CatalogCategoryDetailDto,
  CatalogCategoryDto,
  CatalogFulfilmentMode,
  CatalogHomeDto,
  CatalogProductDetailDto,
  CatalogProductSort,
  CatalogProductSummaryDto,
  CatalogSuggestionDto,
  Locale,
  PaginatedResponse,
} from '@packvio/shared';
import { apiFetch, CACHE_TAGS } from './client';
import { isNotFound } from './errors';

/**
 * One function per catalog endpoint, returning the shared DTO types verbatim.
 *
 * The `*OrNotFound` variants are where an API 404 becomes Next's notFound().
 * That translation lives here rather than in each page so no page can forget it
 * and end up rendering a product page for a product that does not exist.
 */

export function getHome(locale: Locale): Promise<CatalogHomeDto> {
  return apiFetch<CatalogHomeDto>({ path: '/catalog/home', locale });
}

export function getCategories(locale: Locale, options: { tree?: boolean } = {}): Promise<CatalogCategoryDto[]> {
  return apiFetch<CatalogCategoryDto[]>({
    path: '/catalog/categories',
    locale,
    query: { tree: options.tree },
  });
}

export async function getCategoryOrNotFound(
  slug: string,
  locale: Locale,
): Promise<CatalogCategoryDetailDto> {
  return orNotFound(() =>
    apiFetch<CatalogCategoryDetailDto>({
      path: `/catalog/categories/${encodeURIComponent(slug)}`,
      locale,
      tags: [CACHE_TAGS.category(slug)],
    }),
  );
}

/**
 * Slug lookups that answer `null` instead of rendering a 404.
 *
 * These exist for ONE caller: the layout's language-switcher resolver, which
 * needs the alternate slug for the page below it. It must not use the
 * `*OrNotFound` variants, because those call Next's `notFound()` — and a
 * layout that 404s takes the whole route down, including the page that was
 * about to handle the missing slug properly itself. Everywhere else, a missing
 * product IS a 404 and should use the throwing variant.
 */
export async function findCategory(
  slug: string,
  locale: Locale,
): Promise<CatalogCategoryDetailDto | null> {
  return orNull(() =>
    apiFetch<CatalogCategoryDetailDto>({
      path: `/catalog/categories/${encodeURIComponent(slug)}`,
      locale,
      tags: [CACHE_TAGS.category(slug)],
    }),
  );
}

export async function findProduct(
  slug: string,
  locale: Locale,
): Promise<CatalogProductDetailDto | null> {
  return orNull(() =>
    apiFetch<CatalogProductDetailDto>({
      path: `/catalog/products/${encodeURIComponent(slug)}`,
      locale,
      tags: [CACHE_TAGS.product(slug)],
    }),
  );
}

/**
 * Lookup by SKU, for the quote form's `?code=` prefill.
 *
 * Non-throwing for a specific reason: a stale or mistyped code in a shared link
 * must still render the quote form, just without a prefilled line. 404ing the
 * site's primary conversion because a query parameter went out of date throws
 * away a lead over something the buyer never chose.
 */
export async function findProductByCode(
  code: string,
  locale: Locale,
): Promise<CatalogProductDetailDto | null> {
  return orNull(() =>
    apiFetch<CatalogProductDetailDto>({
      path: `/catalog/products/by-code/${encodeURIComponent(code)}`,
      locale,
    }),
  );
}

export type ProductListParams = {
  /** One slug or several — several are OR-ed by the API. */
  category?: string | string[];
  q?: string;
  page?: number;
  perPage?: number;
  sort?: CatalogProductSort;
  fulfilmentMode?: CatalogFulfilmentMode;
  featured?: boolean;
  /** Restrict to products a buyer's logo can be printed on. */
  customPrinting?: boolean;
};

export function getProducts(
  locale: Locale,
  params: ProductListParams = {},
): Promise<PaginatedResponse<CatalogProductSummaryDto>> {
  // One tag per selected category, so a webhook for any one of them
  // invalidates every filtered view that included it.
  const categories =
    params.category === undefined
      ? []
      : Array.isArray(params.category)
        ? params.category
        : [params.category];

  return apiFetch<PaginatedResponse<CatalogProductSummaryDto>>({
    path: '/catalog/products',
    locale,
    query: { ...params },
    tags: categories.map((slug) => CACHE_TAGS.category(slug)),
  });
}

export async function getProductOrNotFound(
  slug: string,
  locale: Locale,
): Promise<CatalogProductDetailDto> {
  return orNotFound(() =>
    apiFetch<CatalogProductDetailDto>({
      path: `/catalog/products/${encodeURIComponent(slug)}`,
      locale,
      tags: [CACHE_TAGS.product(slug)],
    }),
  );
}

export async function getProductByCodeOrNotFound(
  code: string,
  locale: Locale,
): Promise<CatalogProductDetailDto> {
  return orNotFound(() =>
    apiFetch<CatalogProductDetailDto>({
      path: `/catalog/products/by-code/${encodeURIComponent(code)}`,
      locale,
    }),
  );
}

/**
 * Header autocomplete. Called from a route handler on every keystroke, so it
 * opts out of the ISR cache entirely — a five-minute-old suggestion list keyed
 * by an arbitrary query string would poison the cache for no benefit.
 */
export function getSuggestions(
  locale: Locale,
  q: string,
  limit = 8,
): Promise<CatalogSuggestionDto[]> {
  return apiFetch<CatalogSuggestionDto[]>({
    path: '/catalog/search/suggest',
    locale,
    query: { q, limit },
    revalidate: 0,
  });
}

/**
 * Runs a fetch and converts an API 404 into Next's notFound().
 *
 * Anything else is rethrown so error.tsx can show the reader that something
 * broke. Swallowing it would produce the half-empty page the brief rules out.
 */
async function orNotFound<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
}

/**
 * Same rule as `orNotFound`, but a 404 becomes `null` rather than a rendered
 * 404 page. Anything else still throws — a lookup that fails because the API is
 * down must not be indistinguishable from one that found nothing.
 */
async function orNull<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
