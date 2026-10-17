import { getTranslations } from 'next-intl/server';
import { FileText, SearchX } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { Button, Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import {
  clearFilters,
  hasActiveFilters,
  listingHref,
  type ListingParams,
  type ListingTarget,
} from '@/lib/product-query';

export type EmptyResultsProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
  params: ListingParams;
  target: ListingTarget;
  className?: string;
};

/**
 * What the reader sees when nothing matched — and a real conversion path.
 *
 * This matters more here than on a normal catalog. There is no product
 * photography yet, so searches lean entirely on names and codes, and a buyer
 * looking for "clamshell" when the catalog says "HMR container" will land here
 * having found nothing. A dead end at that moment loses a lead that was one
 * question away from an order.
 *
 * So it does three things a bare "no results" cannot: it echoes back exactly
 * what was searched and filtered, so the reader can see WHY it is empty; it
 * offers a one-click way out of the filters; and it routes to the quote form,
 * because "we may still stock it — ask us" is the truth and is the whole point
 * of a quote-first catalog.
 */
export async function EmptyResults({
  locale,
  categories,
  params,
  target,
  className,
}: EmptyResultsProps) {
  const t = await getTranslations({ locale, namespace: 'products.empty' });
  const tFilters = await getTranslations({ locale, namespace: 'products.filters' });

  const byName = new Map(categories.map((category) => [category.slug, category.name]));
  const applied = [
    ...params.categories.map((slug) => byName.get(slug) ?? slug),
    ...(params.fulfilmentMode ? [tFilters(`fulfilmentMode.${params.fulfilmentMode}`)] : []),
    ...(params.customPrinting ? [tFilters('customPrintingAvailable')] : []),
  ];

  return (
    <div
      className={cx(
        'flex flex-col items-center gap-4 rounded-md border border-border bg-surface-alt px-6 py-2xl text-center',
        className,
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-pill bg-panel text-brand-purple">
        <Icon icon={SearchX} size={24} />
      </span>

      <div className="max-w-[36rem]">
        <h2 className="text-h2 font-semibold text-brand-purple">{t('heading')}</h2>

        {params.q && (
          <p className="mt-2 text-body text-ink">
            {t.rich('searchedFor', {
              // The term is echoed with bidi isolation: an English search on an
              // Arabic page ("cup") would otherwise reorder around the quotes.
              term: () => <span className="bidi-latin font-medium">{params.q}</span>,
            })}
          </p>
        )}

        {applied.length > 0 && (
          <p className="mt-2 text-body-sm text-ink-muted">
            {t('withFilters', { filters: applied.join('، ') })}
          </p>
        )}

        <p className="mt-4 text-body text-ink-muted">{t('help')}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {hasActiveFilters(params) && (
          <Button
            as="a"
            href={listingHref(target, clearFilters(params))}
            variant="secondary"
          >
            {tFilters('clearAll')}
          </Button>
        )}

        <Button as="a" href="/quote" icon={<Icon icon={FileText} size={18} />}>
          {t('askUs')}
        </Button>
      </div>

      <p className="text-body-sm text-ink-muted">
        {t.rich('browseAll', {
          link: (chunks) => (
            <Link href="/products" className="font-medium text-brand-purple hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
