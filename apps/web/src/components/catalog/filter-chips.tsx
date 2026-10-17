import { getTranslations } from 'next-intl/server';
import { X } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import {
  clearFilters,
  hasActiveFilters,
  listingHref,
  toggleCategory,
  withCustomPrinting,
  withFulfilmentMode,
  type ListingParams,
  type ListingTarget,
} from '@/lib/product-query';

export type FilterChipsProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
  params: ListingParams;
  target: ListingTarget;
  className?: string;
};

/**
 * What is currently narrowing the results, and how to stop it.
 *
 * The sidebar already shows the state, but it is a long list on desktop and
 * behind a drawer on mobile — so on a phone the ONLY way to see that three
 * filters are hiding most of the catalog is this row. Each chip removes exactly
 * its own filter, which is what makes "actually, keep the category but drop the
 * printing filter" a single click rather than a trip back into the drawer.
 */
export async function FilterChips({
  locale,
  categories,
  params,
  target,
  className,
}: FilterChipsProps) {
  if (!hasActiveFilters(params)) return null;

  const t = await getTranslations({ locale, namespace: 'products.filters' });
  const byName = new Map(categories.map((category) => [category.slug, category.name]));

  const chips = [
    ...params.categories.map((slug) => ({
      key: `category:${slug}`,
      // A slug with no matching category is still shown, by its slug: silently
      // dropping it would leave a filter the reader cannot see and cannot clear.
      label: byName.get(slug) ?? slug,
      next: toggleCategory(params, slug),
    })),
    ...(params.fulfilmentMode
      ? [
          {
            key: `fulfilment:${params.fulfilmentMode}`,
            label: t(`fulfilmentMode.${params.fulfilmentMode}`),
            next: withFulfilmentMode(params, params.fulfilmentMode),
          },
        ]
      : []),
    ...(params.customPrinting
      ? [
          {
            key: 'printing',
            label: t('customPrintingAvailable'),
            next: withCustomPrinting(params, false),
          },
        ]
      : []),
  ];

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <span className="text-body-sm text-ink-muted">{t('active')}</span>

      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={listingHref(target, chip.next)}
              scroll={false}
              aria-label={t('removeFilter', { filter: chip.label })}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-pill border border-brand-purple/30 bg-brand-purple/5',
                'py-1 pe-1.5 ps-3 text-body-sm text-brand-purple transition-colors',
                'hover:border-brand-purple hover:bg-brand-purple hover:text-surface',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
              )}
            >
              {chip.label}
              <Icon icon={X} size={14} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={listingHref(target, clearFilters(params))}
        scroll={false}
        className={cx(
          'rounded-sm px-2 py-1 text-body-sm font-medium text-brand-purple underline underline-offset-2',
          'hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        )}
      >
        {t('clearAll')}
      </Link>
    </div>
  );
}
