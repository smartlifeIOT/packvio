import { defineRouting } from 'next-intl/routing';
import type { Locale } from '@packvio/shared';

/**
 * Localized route segments.
 *
 * The KEY is the internal pathname — it matches the folder layout under
 * `app/[locale]/` and is what every `<Link href>` in the codebase uses. The
 * VALUE is what the reader sees in the address bar.
 *
 * Arabic segments are the real Arabic words, not transliterations. `/ar/products`
 * would be a URL written in a language the page is not in; `/ar/المنتجات` is the
 * page's own name. Browsers percent-encode it on the wire and display it decoded,
 * so the reader sees Arabic and the server receives valid ASCII.
 *
 * Note the dynamic `[slug]` segments: the slug itself is ALSO localized — an
 * Arabic category lives at `/ar/الفئات/اكواب-قهوة-ورقية` and the same category at
 * `/en/categories/coffee-cups`. next-intl translates the static part; the API's
 * `alternateSlug` supplies the dynamic part when switching locale.
 */
export const pathnames = {
  '/': '/',
  '/products': {
    ar: '/المنتجات',
    en: '/products',
  },
  '/categories/[slug]': {
    ar: '/الفئات/[slug]',
    en: '/categories/[slug]',
  },
  '/product/[slug]': {
    ar: '/منتج/[slug]',
    en: '/product/[slug]',
  },
  '/custom-printing': {
    ar: '/الطباعة-المخصصة',
    en: '/custom-printing',
  },
  '/about': {
    ar: '/عن-باك-فيو',
    en: '/about',
  },
  '/contact': {
    ar: '/تواصل-معنا',
    en: '/contact',
  },
  '/faq': {
    ar: '/الأسئلة-الشائعة',
    en: '/faq',
  },
  '/quote': {
    ar: '/طلب-عرض-سعر',
    en: '/quote',
  },
} as const;

export type AppPathname = keyof typeof pathnames;

/**
 * Pathnames with no dynamic segment, so they can be passed to `<Link href>` as a
 * bare string. A route with a `[slug]` needs the object form
 * (`{ pathname, params }`) because the slug has to come from somewhere — and
 * this type is what makes forgetting that a compile error instead of a link to
 * the literal URL "/categories/[slug]".
 */
export type StaticAppPathname = Exclude<AppPathname, `${string}[${string}`>;

/**
 * Arabic is the DEFAULT locale and English is secondary.
 * `localePrefix: 'always'` keeps /ar in the URL, which is what makes the
 * middleware redirect `/` to `/ar` instead of serving Arabic at the bare root.
 */
export const routing = defineRouting({
  locales: ['ar', 'en'] satisfies Locale[],
  defaultLocale: 'ar' satisfies Locale,
  localePrefix: 'always',
  // Don't let an Accept-Language header override the Arabic default.
  localeDetection: false,
  pathnames,
});

export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;

/** Text direction per locale — consumed by the root layout's <html dir>. */
export const localeDirections: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** The other locale. Used by the language switcher and hreflang alternates. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}
