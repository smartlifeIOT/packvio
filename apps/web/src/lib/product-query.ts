import type { CatalogFulfilmentMode, CatalogProductSort } from '@packvio/shared';

/**
 * The product listing's filter state — which lives in the URL, and nowhere else.
 *
 * Every filtered view is therefore a real address: linkable, bookmarkable,
 * shareable with a colleague, and reachable by the back button. Holding any of
 * it in React state instead would make "send me the link to those" impossible,
 * which for a wholesale buyer comparing options with a purchasing manager is
 * the normal way this page gets used.
 *
 * This module is the ONLY place that knows how that state is spelled in a query
 * string. The listing page, the category page, the filter sidebar, the chips,
 * the sort control and the pagination all go through it, so the encoding cannot
 * drift between the thing that writes a link and the thing that reads it.
 */

export const PRODUCT_SORTS: readonly CatalogProductSort[] = [
  'featured',
  'name',
  'newest',
] as const;

export const FULFILMENT_MODES: readonly CatalogFulfilmentMode[] = ['quote', 'cart', 'both'] as const;

/** Products per page. 24 divides evenly by 2, 3 and 4 — every grid breakpoint. */
export const PER_PAGE = 24;

export type ListingParams = {
  /** Category slugs, OR-ed. Empty means "no category filter". */
  categories: string[];
  q: string | null;
  sort: CatalogProductSort;
  page: number;
  fulfilmentMode: CatalogFulfilmentMode | null;
  /** True = only printable products. Null = no opinion (NOT false). */
  customPrinting: boolean | null;
};

/** What Next hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export const EMPTY_LISTING: ListingParams = {
  categories: [],
  q: null,
  sort: 'featured',
  page: 1,
  fulfilmentMode: null,
  customPrinting: null,
};

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function first(value: string | string[] | undefined): string | null {
  const [head] = toArray(value);
  return head ?? null;
}

/**
 * Reads the URL into `ListingParams`, tolerating anything.
 *
 * A hand-edited or stale URL must never 500 the listing: an unknown sort falls
 * back to `featured`, a non-numeric page to 1. The page is a public URL and
 * people do edit it.
 */
export function parseListingParams(raw: RawSearchParams): ListingParams {
  const sort = first(raw.sort);
  const mode = first(raw.fulfilmentMode);
  const page = Number.parseInt(first(raw.page) ?? '1', 10);
  const printing = first(raw.customPrinting);

  return {
    categories: [...new Set(toArray(raw.category))],
    q: first(raw.q),
    sort: PRODUCT_SORTS.find((candidate) => candidate === sort) ?? 'featured',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    fulfilmentMode: FULFILMENT_MODES.find((candidate) => candidate === mode) ?? null,
    // Only `true` filters. `?customPrinting=false` is treated as "no filter"
    // rather than "show me things we cannot print on", because the toggle in
    // the UI has two states — on and absent — not three.
    customPrinting: printing === 'true' ? true : null,
  };
}

/**
 * The inverse: `ListingParams` → a query object for next-intl's `<Link href>`.
 *
 * Defaults are OMITTED rather than written out, so the unfiltered listing is
 * `/en/products` and not `/en/products?sort=featured&page=1`. One canonical URL
 * per view keeps the page's search ranking in one place instead of split across
 * spellings of the same thing.
 */
export function toListingQuery(params: ListingParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  if (params.categories.length > 0) query.category = params.categories;
  if (params.q) query.q = params.q;
  if (params.sort !== 'featured') query.sort = params.sort;
  if (params.page > 1) query.page = String(params.page);
  if (params.fulfilmentMode) query.fulfilmentMode = params.fulfilmentMode;
  if (params.customPrinting) query.customPrinting = 'true';

  return query;
}

/**
 * Which page the listing controls link back to.
 *
 * The listing and a category page render the SAME grid, sort control, chips and
 * pagination — the only difference is where a page-2 link points. Modelling
 * that as a target passed down, rather than duplicating the components per
 * route, is what keeps "preserve every query parameter when paging" a rule
 * implemented once.
 */
export type ListingTarget =
  | { pathname: '/products' }
  | { pathname: '/categories/[slug]'; slug: string };

/** A `<Link href>` for this target with these params applied. */
export function listingHref(target: ListingTarget, params: ListingParams) {
  const query = toListingQuery(params);

  return target.pathname === '/products'
    ? ({ pathname: '/products', query } as const)
    : ({ pathname: '/categories/[slug]', params: { slug: target.slug }, query } as const);
}

/**
 * Any change to a FILTER returns to page 1.
 *
 * Without this, narrowing the results while on page 7 lands the reader on page
 * 7 of a 2-page result set — an empty grid that looks like "no matches" when
 * there are plenty. Paging itself is the one mutation that keeps its page.
 */
function refiltered(params: ListingParams, changes: Partial<ListingParams>): ListingParams {
  return { ...params, ...changes, page: 1 };
}

export function toggleCategory(params: ListingParams, slug: string): ListingParams {
  const categories = params.categories.includes(slug)
    ? params.categories.filter((entry) => entry !== slug)
    : [...params.categories, slug];

  return refiltered(params, { categories });
}

export function withSort(params: ListingParams, sort: CatalogProductSort): ListingParams {
  return refiltered(params, { sort });
}

export function withFulfilmentMode(
  params: ListingParams,
  mode: CatalogFulfilmentMode | null,
): ListingParams {
  return refiltered(params, { fulfilmentMode: params.fulfilmentMode === mode ? null : mode });
}

export function withCustomPrinting(params: ListingParams, on: boolean): ListingParams {
  return refiltered(params, { customPrinting: on ? true : null });
}

export function withPage(params: ListingParams, page: number): ListingParams {
  return { ...params, page };
}

export function withoutQuery(params: ListingParams): ListingParams {
  return refiltered(params, { q: null });
}

/**
 * Clears every filter but KEEPS the search term.
 *
 * "Clear all" on a search-results page means "stop narrowing what I searched
 * for", not "forget what I searched for" — dropping the query too would leave
 * the reader staring at all 213 products wondering what happened.
 */
export function clearFilters(params: ListingParams): ListingParams {
  return { ...EMPTY_LISTING, q: params.q };
}

/** True when anything beyond the bare listing is applied. */
export function hasActiveFilters(params: ListingParams): boolean {
  return (
    params.categories.length > 0 ||
    params.fulfilmentMode !== null ||
    params.customPrinting !== null
  );
}
