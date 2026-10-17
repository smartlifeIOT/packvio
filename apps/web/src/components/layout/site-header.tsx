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
    <HeaderShell>
      {/* Contact strip — desktop only. Hidden on mobile, where the same details
          live at the bottom of the drawer instead of stealing a row of screen. */}
      <div className="hidden border-b border-border bg-surface-alt lg:block">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
          <p className="text-caption text-ink-muted">{t('contactStripTagline')}</p>

          <div className="flex items-center gap-4">
            <a
              href={CONTACT.phoneHref}
              className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-brand-purple"
            >
              <Icon icon={Phone} size={14} />
              <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
            </a>

            <a
              href={CONTACT.emailHref}
              className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-brand-purple"
            >
              <Icon icon={Mail} size={14} />
              <span className="bidi-latin">{CONTACT.email}</span>
            </a>

            <span aria-hidden="true" className="h-3 w-px bg-border" />

            <LanguageSwitcher locale={locale} href={alternateHref} variant="inline" />
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div className="mx-auto flex w-full max-w-page items-center gap-3 px-4 py-3 sm:px-6">
        <MobileDrawer categories={categories} localeSwitcher={<LanguageSwitcher locale={locale} href={alternateHref} variant="compact" />} />

        <Link href="/" aria-label={tCommon('brand')} className="shrink-0">
          {/* Explicit width/height: the logo is the first thing painted, and an
              unsized SVG here would shift every element below it on load. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG;
              next/image would add an optimizer hop for a vector that never resizes. */}
          <img
            src="/brand/packvio-logo.svg"
            alt={tCommon('brand')}
            width={148}
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
  );
}
