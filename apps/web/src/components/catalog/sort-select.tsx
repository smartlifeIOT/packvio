'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { CatalogProductSort } from '@packvio/shared';
import { cx } from '@/lib/cx';
import {
  PRODUCT_SORTS,
  listingHref,
  withSort,
  type ListingParams,
  type ListingTarget,
} from '@/lib/product-query';

export type SortSelectProps = {
  params: ListingParams;
  target: ListingTarget;
  className?: string;
};

/**
 * Sort order — the one listing control that is NOT a link.
 *
 * A native <select> is the right element for "pick one of three", and it gets
 * the platform's own picker on mobile, which beats anything hand-built. The
 * cost is that changing it has to navigate in an effect rather than being an
 * anchor, so this is the listing's only client component.
 *
 * The URL is still the source of truth: `value` reads from `params`, so a
 * pasted `?sort=newest` shows "Newest" here without any state to synchronise.
 *
 * Prices are absent from the options on purpose. The API supports `price_asc`
 * and `price_desc`, but every row's price is null until the Salla sync runs, so
 * both would return the catalog in an order the reader cannot see the reason
 * for. They come back when prices do.
 */
export function SortSelect({ params, target, className }: SortSelectProps) {
  const t = useTranslations('products.sort');
  const router = useRouter();

  return (
    <div className={cx('flex items-center gap-2', className)}>
      <label htmlFor="products-sort" className="whitespace-nowrap text-body-sm text-ink-muted">
        {t('label')}
      </label>

      <select
        id="products-sort"
        value={params.sort}
        onChange={(event) => {
          const next = withSort(params, event.target.value as CatalogProductSort);
          router.push(
            listingHref(target, next),
            // Same reasoning as the filter links: refine in place rather than
            // jumping the reader to the top of the page.
            { scroll: false },
          );
        }}
        className={cx(
          'rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        )}
      >
        {PRODUCT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(sort)}
          </option>
        ))}
      </select>
    </div>
  );
}
