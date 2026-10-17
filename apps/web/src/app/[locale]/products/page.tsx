import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmptyResults } from '@/components/catalog/empty-results';
import { FilterChips } from '@/components/catalog/filter-chips';
import { FilterDrawer } from '@/components/catalog/filter-drawer';
import { FilterSidebar } from '@/components/catalog/filter-sidebar';
import { Pagination } from '@/components/catalog/pagination';
import { ProductRail } from '@/components/catalog/product-rail';
import { SortSelect } from '@/components/catalog/sort-select';
import { Section } from '@/components/ui';
import { isLocale } from '@/i18n/routing';
import { getCategories, getProducts } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import {
  PER_PAGE,
  hasActiveFilters,
  parseListingParams,
  type ListingTarget,
  type RawSearchParams,
} from '@/lib/product-query';

/** This page's own route, for every filter, chip, sort and page link. */
const LISTING_TARGET: ListingTarget = { pathname: '/products' };

type ProductsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
};

/**
 * Title reflects what the reader is actually looking at.
 *
 * A search shows the term, a single category shows its name, and only the bare
 * listing gets the generic heading. Twelve filtered views all titled "Products"
 * are twelve identical tabs and twelve identical search results.
 */
export async function generateMetadata({
  params,
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const listing = parseListingParams(await searchParams);
  const t = await getTranslations({ locale, namespace: 'products' });

  if (listing.q) {
    return {
      title: t('searchHeading', { query: listing.q }),
      description: t('intro'),
      // A search-results page is not a page anyone should reach from Google;
      // it is a view of pages that already exist on their own.
      robots: { index: false, follow: true },
    };
  }

  if (listing.categories.length === 1) {
    const slug = listing.categories[0];
    const categories = await getCategories(locale);
    const category = categories.find((entry) => entry.slug === slug);
    if (category) {
      return { title: t('inCategory', { category: category.name }), description: t('intro') };
    }
  }

  return {
    title: t('title'),
    description: t('intro'),
    // Filtered permutations are near-duplicates of the listing; only the clean
    // URL should compete for it.
    ...(hasActiveFilters(listing) || listing.page > 1
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}

/**
 * The product listing.
 *
 * A server component throughout, with exactly one client island (the sort
 * <select>) and one client wrapper (the mobile filter drawer). Everything else
 * — every filter, every chip, every page link — is an anchor to a different
 * URL, which is what makes a filtered view shareable.
 */
export default async function ProductsPage({ params, searchParams }: ProductsPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const listing = parseListingParams(await searchParams);

  const [results, categories, t] = await Promise.all([
    getProducts(locale, {
      category: listing.categories,
      q: listing.q ?? undefined,
      sort: listing.sort,
      page: listing.page,
      perPage: PER_PAGE,
      fulfilmentMode: listing.fulfilmentMode ?? undefined,
      customPrinting: listing.customPrinting ?? undefined,
    }),
    getCategories(locale),
    getTranslations({ locale, namespace: 'products' }),
  ]);

  const activeCount =
    listing.categories.length +
    (listing.fulfilmentMode ? 1 : 0) +
    (listing.customPrinting ? 1 : 0);

  const heading = listing.q ? t('searchHeading', { query: listing.q }) : t('heading');

  return (
    <Section spacing="lg" aria-labelledby="products-heading">
      <h1 id="products-heading" className="text-display-3 font-semibold text-brand-purple">
        {heading}
      </h1>
      <p className="mt-2 max-w-[46rem] text-body text-ink-muted">{t('intro')}</p>

      <div className="mt-lg grid gap-lg lg:grid-cols-[16rem_1fr] lg:gap-xl">
        {/* Desktop: filters live in a permanent column. */}
        <aside aria-label={t('filters.title')} className="hidden lg:block">
          <FilterSidebar
            locale={locale}
            categories={categories}
            params={listing}
            target={LISTING_TARGET}
          />
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterDrawer activeCount={activeCount} className="lg:hidden">
              <FilterSidebar
                locale={locale}
                categories={categories}
                params={listing}
                target={LISTING_TARGET}
              />
            </FilterDrawer>

            <p aria-live="polite" className="text-body-sm text-ink-muted">
              {t('resultCount', {
                count: results.total,
                formatted: formatNumber(results.total, locale),
              })}
            </p>

            <SortSelect params={listing} target={LISTING_TARGET} className="ms-auto" />
          </div>

          <FilterChips
            locale={locale}
            categories={categories}
            params={listing}
            target={LISTING_TARGET}
            className="mt-4"
          />

          {results.items.length > 0 ? (
            <>
              <ProductRail
                products={results.items}
                label={heading}
                layout="listing"
                prioritizeFirst
                className="mt-lg"
              />

              <Pagination
                locale={locale}
                params={listing}
                page={results.page}
                totalPages={results.totalPages}
                target={LISTING_TARGET}
                className="mt-xl"
              />
            </>
          ) : (
            <EmptyResults
              locale={locale}
              categories={categories}
              params={listing}
              target={LISTING_TARGET}
              className="mt-lg"
            />
          )}
        </div>
      </div>
    </Section>
  );
}
