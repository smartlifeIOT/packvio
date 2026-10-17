import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { WhatsAppButton } from '@/components/layout/whatsapp-button';
import { QuoteBasketProvider } from '@/components/quote/quote-basket';
import { UtmCapture } from '@/components/quote/utm-capture';
import { isLocale, localeDirections, routing } from '@/i18n/routing';
import { getCategories } from '@/lib/api';
import { resolveAlternateHref } from '@/lib/locale-alternates';
import { fontVariables } from '../fonts';
import '../globals.css';

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/** Pre-render both locale trees at build time. */
export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * THE WHOLE LOCALE TREE RENDERS ON DEMAND. Route segment config set on a layout
 * applies to every segment beneath it, so this one line covers every page.
 *
 * Two reasons, and the second is what forced it.
 *
 * First, it is what this tree already does. `resolveAlternateHref()` reads
 * `headers()` to build the language switcher's href (see CLAUDE.md), and a
 * render that reads request headers cannot be a build artefact. Stating it here
 * makes the contract explicit instead of an emergent property of a helper three
 * files away that someone could "optimise" without realising what they moved.
 *
 * Second, prerendering these pages requires a live catalog API AT BUILD TIME,
 * and `docker build` has no network to one. The build failed on
 * `/ar/custom-printing` for exactly that reason: an image cannot depend on a
 * running Postgres in order to exist. Deferring the render removes the
 * dependency entirely — the container is built from source alone and fetches
 * data when it serves.
 *
 * `fetchCache` is pinned alongside it because `force-dynamic` alone would take
 * the fetch cache with it: it flips the default for every fetch in the tree to
 * no-store, and each page render would then re-query the API instead of reusing
 * the five-minute entry that `revalidate: 300` asks for. `default-cache` keeps
 * that explicit option authoritative. The cost of this pair is a render per
 * request, not a round trip per request — which is the trade the brief chose.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = await getTranslations({ locale, namespace: 'home.meta' });

  return {
    title: { default: t('title'), template: `%s · ${t('siteName')}` },
    description: t('description'),
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : undefined,
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  // Required for static rendering of the [locale] segment.
  setRequestLocale(locale);

  /**
   * Categories are fetched ONCE here and shared by the mega-menu, the mobile
   * drawer and the footer. Fetching them in each component would be three
   * identical requests per page render; the ISR cache would collapse them, but
   * relying on a cache to hide a design mistake is not the same as not making it.
   */
  const categories = await getCategories(locale);
  const t = await getTranslations({ locale, namespace: 'common' });

  /**
   * Where the language switcher points, resolved HERE rather than in a client
   * effect, so the href is correct in the initial HTML on every route —
   * including product and category pages, where the slug itself is translated
   * and the fallback would otherwise be the home page. See
   * lib/locale-alternates.ts for why this costs no extra API call in practice.
   */
  const alternateHref = await resolveAlternateHref(locale);

  return (
    <html lang={locale} dir={localeDirections[locale]} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        {/* v4: the provider inherits locale + messages from the server context. */}
        <NextIntlClientProvider>
          <QuoteBasketProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-brand-purple focus:px-4 focus:py-2 focus:text-surface"
            >
              {t('skipToContent')}
            </a>

            <SiteHeader locale={locale} categories={categories} alternateHref={alternateHref} />

            <main id="main-content" className="flex-1">
              {children}
            </main>

            <SiteFooter locale={locale} categories={categories} />
            <WhatsAppButton locale={locale} />
            <UtmCapture />
          </QuoteBasketProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
