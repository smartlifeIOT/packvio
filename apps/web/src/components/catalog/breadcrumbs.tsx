import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link, type AppHref } from '@/i18n/navigation';
import { localeDirections } from '@/i18n/routing';
import { cx } from '@/lib/cx';

export type Crumb = {
  label: string;
  /** Omitted on the last crumb — the current page is not a link to itself. */
  href?: AppHref;
};

export type BreadcrumbsProps = {
  locale: Locale;
  /** Home is prepended automatically; pass everything after it. */
  trail: Crumb[];
  className?: string;
};

/**
 * Home › Products › Category.
 *
 * The SEPARATOR FLIPS with the writing direction. A breadcrumb chevron is a
 * spatial claim — "this is the way deeper" — so in Arabic it has to point left,
 * because that is the direction the trail is actually reading in. A `›` frozen
 * pointing right in an RTL layout points back at the crumb the reader just came
 * from, which reads as a broken widget rather than a subtle detail.
 *
 * Separators are `aria-hidden`: a screen reader gets the ordered list, which
 * already conveys the nesting, and hearing "greater than" between every crumb
 * is noise.
 */
export async function Breadcrumbs({ locale, trail, className }: BreadcrumbsProps) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const Separator = localeDirections[locale] === 'rtl' ? ChevronLeft : ChevronRight;

  const crumbs: Crumb[] = [{ label: t('home'), href: '/' }, ...trail];

  return (
    <nav aria-label={t('breadcrumb')} className={cx('text-body-sm', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <Icon
                  icon={Separator}
                  size={14}
                  className="shrink-0 text-ink-muted/60"
                  aria-hidden="true"
                />
              )}

              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="inline-flex items-center gap-1 rounded-sm text-ink-muted transition-colors hover:text-brand-purple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple"
                >
                  {index === 0 && <Icon icon={Home} size={14} aria-hidden="true" />}
                  {crumb.label}
                </Link>
              ) : (
                // The current page: present in the list, but not a link, and
                // marked so assistive tech announces it as the current location.
                <span aria-current="page" className="font-medium text-ink">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
