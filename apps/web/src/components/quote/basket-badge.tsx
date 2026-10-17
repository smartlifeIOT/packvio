'use client';

import { useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { useQuoteBasket } from './quote-basket';

export type BasketBadgeProps = {
  className?: string;
};

/**
 * The header's quote-list link, with a count.
 *
 * It renders NOTHING until the basket has loaded and has something in it. Two
 * reasons, and the first is the important one:
 *
 *  - The count lives in sessionStorage, which the server cannot see. Rendering
 *    a "0" server-side and a "3" on hydration is a mismatch on every page load
 *    for anyone with a basket. Waiting for `isReady` makes the server and the
 *    first client render agree on "nothing", and the badge appears afterwards.
 *  - An empty quote list is not worth a permanent slot in a header that already
 *    carries search, navigation and a call to action.
 */
export function BasketBadge({ className }: BasketBadgeProps) {
  const t = useTranslations('quote.basket');
  const { count, isReady } = useQuoteBasket();

  if (!isReady || count === 0) return null;

  return (
    <Link
      href="/quote"
      aria-label={t('badgeLabel', { count })}
      className={cx(
        'relative inline-flex items-center justify-center rounded-md p-2 text-brand-purple',
        'transition-colors hover:bg-surface-alt',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
        className,
      )}
    >
      <Icon icon={ClipboardList} size={20} />

      {/* Positioned with logical inset so it sits on the outer top corner in
          both directions rather than always on the right. */}
      <span
        aria-hidden="true"
        className={cx(
          'absolute -top-0.5 end-0 inline-flex min-w-4.5 items-center justify-center',
          'rounded-pill bg-brand-purple px-1 text-[0.625rem] font-semibold leading-4 text-surface',
        )}
      >
        {count}
      </span>
    </Link>
  );
}
