import { getTranslations } from 'next-intl/server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { CatalogCategoryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { topLevelCategories } from '@/lib/category-tree';
import { CONTACT } from './nav-links';

export type SiteFooterProps = {
  locale: Locale;
  categories: CatalogCategoryDto[];
};

const FOOTER_CATEGORY_LIMIT = 8;

const SITE_LINKS = [
  { href: '/products', messageKey: 'products' },
  { href: '/custom-printing', messageKey: 'customPrinting' },
  { href: '/about', messageKey: 'about' },
  { href: '/faq', messageKey: 'faq' },
  { href: '/contact', messageKey: 'contact' },
  { href: '/quote', messageKey: 'requestQuote' },
] as const;

/**
 * Checks for an optional brand asset at build time.
 *
 * The Vision 2030 lockup is a "if we have it" item, and a missing-image icon in
 * the footer of every page is worse than not showing it. Resolved on the server
 * against the filesystem rather than guessed, so the markup is simply absent
 * when the file is absent — no broken request, no layout hole.
 */
function publicAssetExists(relativePath: string): boolean {
  return existsSync(join(process.cwd(), 'public', relativePath));
}

export async function SiteFooter({ locale, categories }: SiteFooterProps) {
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const hasVisionLogo = publicAssetExists('brand/vision-2030.svg');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-purple text-surface">
      <div className="mx-auto w-full max-w-page px-4 py-2xl sm:px-6">
        <div className="grid gap-xl md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            {/* The white lockup is the SAME artwork as the header's, with its
                own alpha channel filled white — not a repaint — so the two can
                never drift apart. 124x40 is the artwork's 3.111:1 ratio.

                `self-start` is load-bearing and is NOT a nudge to the left.
                This block is `flex flex-col`, whose default `align-items` is
                `stretch`, and an image whose width is `auto` is a stretchable
                item — so the logo was blown out to the full column width while
                `h-10` held the height at 40px, i.e. visibly squashed. The
                header escapes the same bug only because it is a flex ROW, where
                stretch applies to the vertical axis that `h-9` already fixes.
                `w-auto` does not protect against this; only opting out of the
                stretch does. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- static local asset */}
            <img
              src="/brand/packvio-logo-white.webp"
              alt={tCommon('brand')}
              width={124}
              height={40}
              className="h-10 w-auto self-start"
            />
            <p className="text-body-sm leading-relaxed text-surface/80">{t('blurb')}</p>
          </div>

          {/* Categories */}
          <nav aria-labelledby="footer-categories" className="flex flex-col gap-3">
            <h2 id="footer-categories" className="text-h4 font-semibold">
              {t('categoriesHeading')}
            </h2>
            <ul className="flex flex-col gap-2">
              {/* Top-level only: a footer listing "Spoons" beside "Coffee Cups"
                  flattens the taxonomy the nav just established. */}
              {topLevelCategories(categories)
                .slice(0, FOOTER_CATEGORY_LIMIT)
                .map((category) => (
                  <li key={category.id}>
                    <Link
                      href={{ pathname: '/categories/[slug]', params: { slug: category.slug } }}
                      className="text-body-sm text-surface/80 transition-colors hover:text-brand-cyan"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          {/* Site links */}
          <nav aria-labelledby="footer-links" className="flex flex-col gap-3">
            <h2 id="footer-links" className="text-h4 font-semibold">
              {t('linksHeading')}
            </h2>
            <ul className="flex flex-col gap-2">
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-body-sm text-surface/80 transition-colors hover:text-brand-cyan"
                  >
                    {tNav(link.messageKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div className="flex flex-col gap-3">
            <h2 className="text-h4 font-semibold">{t('contactHeading')}</h2>
            <address className="flex flex-col gap-3 not-italic">
              <span className="flex items-start gap-2 text-body-sm text-surface/80">
                <Icon icon={MapPin} size={16} className="mt-0.5 text-brand-cyan" />
                {t('address')}
              </span>

              <a
                href={CONTACT.phoneHref}
                className="flex items-center gap-2 text-body-sm text-surface/80 transition-colors hover:text-brand-cyan"
              >
                <Icon icon={Phone} size={16} className="text-brand-cyan" />
                <span className="bidi-latin font-mono">{CONTACT.phoneDisplay}</span>
              </a>

              <a
                href={CONTACT.emailHref}
                className="flex items-center gap-2 text-body-sm text-surface/80 transition-colors hover:text-brand-cyan"
              >
                <Icon icon={Mail} size={16} className="text-brand-cyan" />
                <span className="bidi-latin">{CONTACT.email}</span>
              </a>
            </address>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-surface/15">
        <div className="mx-auto flex w-full max-w-page flex-col items-center justify-between gap-3 px-4 py-md sm:flex-row sm:px-6">
          <p className="text-caption text-surface/70">
            © {year} {tCommon('company')}
          </p>

          {hasVisionLogo && (
            /* eslint-disable-next-line @next/next/no-img-element -- static local SVG */
            <img
              src="/brand/vision-2030.svg"
              alt={t('vision2030Alt')}
              width={96}
              height={40}
              className="h-9 w-auto opacity-80"
            />
          )}
        </div>
      </div>
    </footer>
  );
}
