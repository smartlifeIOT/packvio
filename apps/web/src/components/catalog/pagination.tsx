import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { localeDirections } from '@/i18n/routing';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { listingHref, withPage, type ListingParams, type ListingTarget } from '@/lib/product-query';

export type PaginationProps = {
  locale: Locale;
  params: ListingParams;
  page: number;
  totalPages: number;
  target: ListingTarget;
  className?: string;
};

/**
 * Numbered pagination that preserves every other query parameter.
 *
 * It builds each href from the CURRENT `ListingParams` with only the page
 * changed, so filters, the search term and the sort order survive a page turn.
 * Losing them is the classic pagination bug — the reader filters to 30 results,
 * clicks page 2, and is looking at page 2 of all 213.
 */
export async function Pagination({
  locale,
  params,
  page,
  totalPages,
  target,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const t = await getTranslations({ locale, namespace: 'products.pagination' });

  /**
   * The previous/next ARROWS flip with the writing direction, the LABELS do not.
   *
   * An arrow is a spatial instruction, so it has to agree with the direction
   * the reader is travelling in: under RTL the previous page lies in the
   * opposite direction from LTR, and an arrow frozen one way points away from
   * where the content actually is. This is the one place the component needs to
   * know the direction; everything else is handled by logical properties.
   */
  const isRtl = localeDirections[locale] === 'rtl';
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  const href = (page: number) => listingHref(target, withPage(params, page));

  return (
    <nav aria-label={t('label')} className={cx('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={arrowClasses}>
              <Icon icon={PreviousIcon} size={16} />
              <span className="hidden sm:inline">{t('previous')}</span>
            </Link>
          ) : (
            <span className={cx(arrowClasses, 'cursor-not-allowed opacity-40')} aria-hidden="true">
              <Icon icon={PreviousIcon} size={16} />
              <span className="hidden sm:inline">{t('previous')}</span>
            </span>
          )}
        </li>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === null ? (
            // eslint-disable-next-line react/no-array-index-key -- ellipses have no identity
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-muted">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={href(entry)}
                aria-label={t('goToPage', { page: formatNumber(entry, locale) })}
                aria-current={entry === page ? 'page' : undefined}
                className={cx(
                  'inline-flex min-w-9 items-center justify-center rounded-sm px-2.5 py-2 text-body-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                  entry === page
                    ? 'bg-brand-purple font-semibold text-surface'
                    : 'border border-border text-ink hover:border-brand-purple hover:text-brand-purple',
                )}
              >
                <span className="bidi-latin">{formatNumber(entry, locale)}</span>
              </Link>
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <Link href={href(page + 1)} rel="next" className={arrowClasses}>
              <span className="hidden sm:inline">{t('next')}</span>
              <Icon icon={NextIcon} size={16} />
            </Link>
          ) : (
            <span className={cx(arrowClasses, 'cursor-not-allowed opacity-40')} aria-hidden="true">
              <span className="hidden sm:inline">{t('next')}</span>
              <Icon icon={NextIcon} size={16} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

const arrowClasses = cx(
  'inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-body-sm text-ink',
  'transition-colors hover:border-brand-purple hover:text-brand-purple',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
);

/**
 * Which page numbers to show: always the first and last, and a window around
 * the current page, with `null` marking a gap.
 *
 * Rendering all of them is fine at 9 pages and absurd at 90; this keeps the
 * control a fixed width regardless of catalog size.
 */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | null> = [];

  for (const [index, entry] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && entry - previous > 1) result.push(null);
    result.push(entry);
  }

  return result;
}
