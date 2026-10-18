import { getTranslations } from 'next-intl/server';
import { Mail, Phone } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';
import { HeaderShell } from './header-shell';
import { LanguageSwitcher } from './language-switcher';
import { MegaMenu } from './mega-menu';
import { MobileDrawer } from './mobile-drawer';
import { CONTACT, PRIMARY_NAV } from './nav-links';
import { SearchBox } from './search-box';
import { BasketBadge } from '@/components/quote/basket-badge';

export type SiteHeaderProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
  /** Server-resolved target for the language switcher. See lib/locale-alternates.ts. */
  alternateHref: string;
};

/**
 * The site header, assembled on the server.
 *
 * Categories are fetched once in the layout and handed down, so the mega-menu
 * and the mobile drawer share one list and neither triggers a client fetch. Only
 * the pieces that genuinely need interactivity — the sticky shell, the menu, the
 * drawer, the search box, the switcher — are client components.
 */
export async function SiteHeader({ locale, categories, alternateHref }: SiteHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <>
      {/* ------------------------------------------------------------------
          Announcement strip — what Packvio sells, and how to reach them.

          This was a pale `bg-surface-alt` bar with `text-caption text-ink-muted`
          copy, `py-1.5`, hidden below `lg`. In other words the first line on the
          page — the one that says what this company actually does — was the
          quietest thing on it, and absent entirely for every phone visitor.

          Now it is the brand purple bar it should always have been: white text
          on #39255F (13.09:1), a readable size, and VISIBLE ON MOBILE. The
          contact details stay desktop-only, because on a phone they would wrap
          to a second line and they already live at the bottom of the drawer —
          but the tagline itself is exactly what a first-time visitor needs and
          it now reaches them.

          Cyan is used only for the ICONS here. On purple it measures 6.20:1,
          which is fine, but the Deviations note in CLAUDE.md is strict about it
          never carrying text on a light surface — icons on a dark fill are the
          case it is actually good for.
          ------------------------------------------------------------------ */}
      <div className="bg-brand-purple text-surface">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:py-2.5">
          <p className="text-caption font-medium leading-snug sm:text-body-sm">
            {t('contactStripTagline')}
          </p>

          {/* Desktop only: on a phone these wrap and push the bar to two rows. */}
          <div className="hidden items-center gap-4 lg:flex">
            <a
              href={CONTACT.phoneHref}
              className="inline-flex items-center gap-1.5 text-caption text-surface/90 transition-colors hover:text-brand-cyan"
            >
              <Icon icon={Phone} size={14} className="text-brand-cyan" />
              <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
            </a>

            <a
              href={CONTACT.emailHref}
              className="inline-flex items-center gap-1.5 text-caption text-surface/90 transition-colors hover:text-brand-cyan"
            >
              <Icon icon={Mail} size={14} className="text-brand-cyan" />
              <span className="bidi-latin">{CONTACT.email}</span>
            </a>

            <span aria-hidden="true" className="h-3 w-px bg-surface/25" />

            <LanguageSwitcher locale={locale} href={alternateHref} variant="on-dark" />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Only the MAIN BAR is sticky — the announcement strip above scrolls
          away with the page.

          The whole header used to sit inside HeaderShell, which is
          `sticky top-0`. That was affordable while the strip was a 26px
          desktop-only hairline. It is not affordable now that it is a 40px
          purple bar that also shows on phones: a sticky strip plus a sticky
          nav would hold ~100px of a 667px screen permanently, on every page,
          to repeat a tagline the reader has already read.

          Scrolling it away is also the better reading of "make it prominent".
          It is the first thing on the page and it is unmissable there; what it
          should not be is permanent furniture.
          ------------------------------------------------------------------ */}
      <HeaderShell>
        <div className="mx-auto flex w-full max-w-page items-center gap-3 px-4 py-3 sm:px-6">
          <MobileDrawer
            categories={categories}
            localeSwitcher={
              <LanguageSwitcher locale={locale} href={alternateHref} variant="compact" />
            }
          />

          <Link href="/" aria-label={tCommon('brand')} className="shrink-0">
            {/* Explicit width/height: the logo is the first thing painted, and an
              unsized image here would shift every element below it on load.
              124x40 is the artwork's OWN 3.111:1 ratio — the placeholder this
              replaced was declared 148x40, which would stretch the real
              wordmark by 19%. If the logo is ever re-exported, re-measure. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- static local
              asset at a fixed display size; next/image would add an optimizer
              hop for a file that never resizes. */}
            <img
              src="/brand/packvio-logo.webp"
              alt={tCommon('brand')}
              width={124}
              height={40}
              className="h-9 w-auto sm:h-10"
            />
          </Link>

          <nav aria-label={t('primaryLabel')} className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  {item.hasMegaMenu ? (
                    <MegaMenu categories={categories} label={t(item.messageKey)} />
                  ) : (
                    <Link
                      href={item.href}
                      className={cx(
                        'rounded-sm px-3 py-2 text-body-sm font-medium text-ink',
                        'transition-colors hover:text-brand-purple',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                      )}
                    >
                      {t(item.messageKey)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <SearchBox className="hidden w-56 md:block xl:w-72" />

            <BasketBadge />

            <Link
              href="/quote"
              className={cx(
                'inline-flex items-center whitespace-nowrap rounded-md border border-brand-cyan bg-brand-cyan',
                'px-4 py-2 text-body-sm font-medium text-ink transition-colors',
                'hover:border-brand-purple hover:bg-brand-purple hover:text-surface',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
              )}
            >
              {t('requestQuote')}
            </Link>
          </div>
        </div>
      </HeaderShell>
    </>
  );
}
