import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Locale } from '@packvio/shared';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { EmptyResults } from '@/components/catalog/empty-results';
import { FilterChips } from '@/components/catalog/filter-chips';
import { Pagination } from '@/components/catalog/pagination';
import { ProductRail } from '@/components/catalog/product-rail';
import { SortSelect } from '@/components/catalog/sort-select';
import { categoryIcon } from '@/components/icons/categories';
import { Section } from '@/components/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { isLocale, locales } from '@/i18n/routing';
import { getCategories, getCategoryOrNotFound, getProducts } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import {
  PER_PAGE,
  listingHref,
  parseListingParams,
  type ListingTarget,
  type RawSearchParams,
} from '@/lib/product-query';

type CategoryPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<RawSearchParams>;
};

/**
 * All 18 categories in both locales, so every category page is prerendered
 * rather than built on the first request that asks for it.
 *
 * AN UNREACHABLE API IS NOT A BUILD FAILURE HERE, and that is the whole point of
 * the catch. This function calls the catalog API, and `docker build` runs with
 * no network to one — there is no database beside a build container, and
 * arranging one would make every image depend on a live Postgres to exist.
 * Before the catch, containerising the site failed at exactly this line with
 * "Failed to collect page data", which names the symptom and not the cause.
 *
 * Returning an empty list does not drop the pages: `dynamicParams` defaults to
 * true, so every category is rendered on first request instead and then cached
 * for the same five minutes as everything else. The only thing lost is a warm
 * cache on the first hit after a deploy.
 *
 * So the behaviour is: build WITH an API reachable (a local `npm run build`) and
 * the pages are prerendered; build WITHOUT one (CI, Docker) and they are
 * rendered on demand. Both are correct, and neither can fail the build.
 */
export async function generateStaticParams(): Promise<Array<{ locale: string; slug: string }>> {
  try {
    const perLocale = await Promise.all(
      locales.map(async (locale) => {
        const categories = await getCategories(locale as Locale);
        return categories.map((category) => ({ locale, slug: category.slug }));
      }),
    );

    return perLocale.flat();
  } catch (error) {
    // Loud on purpose. A silent empty list looks identical to a catalog with no
    // categories in it, and someone should be able to read the build log and
    // see that prerendering was skipped rather than that the site is empty.
    console.warn(
      '[build] Catalog API unreachable during generateStaticParams — category pages ' +
        'will render on demand instead of being prerendered. This is expected in a ' +
        'container build.',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const category = await getCategoryOrNotFound(decodeURIComponent(slug), locale);

  return {
    title: category.name,
    description: category.description ?? undefined,
    alternates: {
      canonical: getPathname({
        locale,
        href: { pathname: '/categories/[slug]', params: { slug: category.canonicalSlug } },
      }),
      languages: {
        ar: getPathname({
          locale: 'ar',
          href: {
            pathname: '/categories/[slug]',
            params: { slug: locale === 'ar' ? category.slug : category.alternateSlug },
          },
        }),
        en: getPathname({
          locale: 'en',
          href: {
            pathname: '/categories/[slug]',
            params: { slug: locale === 'en' ? category.slug : category.alternateSlug },
          },
        }),
      },
    },
  };
}

/**
 * A category listing.
 *
 * It reuses the listing's grid, sort control, chips and pagination rather than
 * reimplementing them — the only difference is the `target`, which is what
 * every generated link is built from, so page 2 of a sorted category stays in
 * the category.
 *
 * The API resolves a slug against BOTH locale columns, so arriving on the
 * Arabic slug with `?locale=en` still finds the category. When that happens the
 * response says so, and this page redirects PERMANENTLY to the canonical URL
 * rather than serving the same content at two addresses — which would split its
 * search ranking and confuse anyone who copied the link.
 */
export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { locale, slug: rawSlug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const slug = decodeURIComponent(rawSlug);
  const category = await getCategoryOrNotFound(slug, locale);
  const listing = parseListingParams(await searchParams);

  if (category.slugMatchedOtherLocale) {
    /**
     * 308, not 307. The old URL is not coming back — this category's slug in
     * this locale is `canonicalSlug` and always will be — so a permanent
     * redirect lets search engines move the ranking across instead of
     * indefinitely re-checking a URL whose answer never changes.
     */
    permanentRedirect(
      getPathname({
        locale,
        href: { pathname: '/categories/[slug]', params: { slug: category.canonicalSlug } },
      }),
    );
  }

  const target: ListingTarget = { pathname: '/categories/[slug]', slug: category.slug };

  const [results, categories, t] = await Promise.all([
    getProducts(locale, {
      category: category.slug,
      sort: listing.sort,
      page: listing.page,
      perPage: PER_PAGE,
      fulfilmentMode: listing.fulfilmentMode ?? undefined,
      customPrinting: listing.customPrinting ?? undefined,
    }),
    getCategories(locale),
    getTranslations({ locale, namespace: 'category' }),
  ]);

  return (
    <Section spacing="lg" aria-labelledby="category-heading">
      {/*
        Ancestors come from the API (CatalogCategoryDetailDto.ancestors), root
        first, so a subcategory reads "Home > Products > Cutlery > Spoons".
        Without them a nested page loses the one piece of orientation it owes
        the reader: what it is nested inside.
      */}
      <Breadcrumbs
        locale={locale}
        trail={[
          { label: t('breadcrumbProducts'), href: '/products' },
          ...category.ancestors.map((ancestor) => ({
            label: ancestor.name,
            href: {
              pathname: '/categories/[slug]' as const,
              params: { slug: ancestor.slug },
            },
          })),
          { label: category.name },
        ]}
      />

      <h1 id="category-heading" className="mt-4 text-display-3 font-semibold text-brand-purple">
        {category.name}
      </h1>

      {category.description && (
        <p className="mt-3 max-w-[48rem] text-body-lg text-ink-muted">{category.description}</p>
      )}

      <p className="mt-2 text-body-sm text-ink-muted">
        {t('productCount', {
          count: results.total,
          formatted: formatNumber(results.total, locale),
        })}
      </p>

      {category.children.length > 0 && (
        <nav aria-label={t('subcategories')} className="mt-lg">
          <h2 className="mb-3 text-h3 font-semibold text-brand-purple">{t('subcategories')}</h2>
          <ul className="grid grid-cols-2 gap-4 g3:grid-cols-3 g4:grid-cols-4 lg:gap-6">
            {category.children.map((child) => {
              // Falls back to the parent's icon while a child is undrawn — see
              // categoryIcon's fallback ladder.
              const ChildIcon = categoryIcon(child.slug, { parentSlug: category.slug });

              return (
                <li key={child.id}>
                  <Link
                    href={{ pathname: '/categories/[slug]', params: { slug: child.slug } }}
                    className={cx(
                      'flex h-full flex-col gap-3 rounded-md border border-border bg-panel p-lg',
                      'transition-shadow duration-200 hover:shadow-raised',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                    )}
                  >
                    <ChildIcon size={32} className="text-brand-purple/85" />
                    <span className="mt-auto text-body font-medium text-brand-purple">
                      {child.name}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {t('productCount', {
                        count: child.productCount,
                        formatted: formatNumber(child.productCount, locale),
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mt-lg flex flex-wrap items-center justify-between gap-3">
        <FilterChips locale={locale} categories={categories} params={listing} target={target} />
        <SortSelect params={listing} target={target} className="ms-auto" />
      </div>

      {results.items.length > 0 ? (
        <>
          <ProductRail
            products={results.items}
            label={category.name}
            layout="listing"
            prioritizeFirst
            className="mt-lg"
          />

          <Pagination
            locale={locale}
            params={listing}
            page={results.page}
            totalPages={results.totalPages}
            target={target}
            className="mt-xl"
          />
        </>
      ) : (
        <EmptyResults
          locale={locale}
          categories={categories}
          params={listing}
          target={target}
          className="mt-lg"
        />
      )}

      <p className="mt-xl text-body-sm text-ink-muted">
        {t.rich('browseAll', {
          link: (chunks) => (
            <Link
              href={listingHref({ pathname: '/products' }, listing)}
              className="font-medium text-brand-purple hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Section>
  );
}
