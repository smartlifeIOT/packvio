import type { Metadata } from 'next';
import type { Locale } from '@packvio/shared';
import { getPathname } from '@/i18n/navigation';
import type { StaticAppPathname } from '@/i18n/routing';
import { CONTACT, LOCATION, SOCIAL_LINKS } from '@/components/layout/nav-links';

/**
 * Search (SEO) and AI-answer (GEO) helpers, in one place so the sitemap, the
 * page metadata, the structured data and /llms.txt all describe Packvio the
 * same way.
 *
 * GEO — "generative engine optimisation" — is mostly the same work as SEO done
 * deliberately: assistants like ChatGPT, Gemini and Perplexity quote pages that
 * state facts plainly (who, what, where, how to order) and that carry
 * structured data they can trust. Hence the Organization/LocalBusiness block
 * on every page, the plain-language /llms.txt, and keyword-bearing titles in
 * BOTH languages — most Saudi buyers search in Arabic.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

/** Absolute URL for a site path. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Search phrases buyers actually use, per language. They shape titles and
 * descriptions; the `keywords` meta tag itself is ignored by Google but still
 * read by Bing, Yandex and several AI crawlers.
 */
export const SEO_KEYWORDS: Record<Locale, string[]> = {
  ar: [
    'تغليف المواد الغذائية',
    'مستلزمات المطاعم والكافيهات',
    'أكواب ورقية بالجملة',
    'أكواب قهوة ورقية',
    'أكواب بلاستيك شفافة',
    'علب شوربة ورقية',
    'زبديات كرافت',
    'علب كرافت',
    'علب وجبات',
    'صواني طعام',
    'أكياس ورقية',
    'أكياس توصيل',
    'ملاعق وشوك بلاستيك',
    'مصاصات',
    'أغطية أكواب',
    'طباعة شعار على الأكواب',
    'تغليف بالجملة الرياض',
    'موردين تغليف في السعودية',
    'باك فيو',
  ],
  en: [
    'food packaging Saudi Arabia',
    'wholesale packaging Riyadh',
    'disposable cups wholesale',
    'paper coffee cups',
    'clear plastic cups',
    'soup cups and lids',
    'kraft bowls',
    'kraft paper boxes',
    'lunch boxes',
    'food trays',
    'paper bags',
    'carry bags',
    'plastic cutlery',
    'drinking straws',
    'custom printed cups',
    'restaurant supplies KSA',
    'cafe packaging supplier',
    'Packvio',
  ],
};

/** Open Graph locale codes. */
export const OG_LOCALE: Record<Locale, string> = { ar: 'ar_SA', en: 'en_US' };

/**
 * Canonical + hreflang for a page whose path does not depend on data.
 * Arabic is `x-default` because it is the site's default locale.
 */
export function staticAlternates(locale: Locale, href: StaticAppPathname): Metadata['alternates'] {
  const ar = getPathname({ locale: 'ar', href });
  const en = getPathname({ locale: 'en', href });
  return {
    canonical: locale === 'ar' ? ar : en,
    languages: { ar, en, 'x-default': ar },
  };
}

/**
 * The business, as structured data, on every page.
 *
 * `WholesaleStore` is a LocalBusiness subtype, which is what makes the address,
 * hours and map pin eligible for local results. Coordinates are included only
 * once they are known (see LOCATION) — inventing them would put the pin in the
 * wrong place in every engine that trusts this block.
 */
export function organizationJsonLd(locale: Locale, names: { name: string; description: string }) {
  const hasPin = LOCATION.lat !== null && LOCATION.lng !== null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'WholesaleStore'],
        '@id': absoluteUrl('/#organization'),
        name: names.name,
        alternateName: ['Packvio', 'باك فيو', 'Smavio Limited Trading Co.'],
        legalName: 'Smavio Limited Trading Co.',
        description: names.description,
        url: absoluteUrl(locale === 'ar' ? '/ar' : '/en'),
        logo: absoluteUrl('/brand/packvio-logo.webp'),
        image: absoluteUrl('/og-image.jpg'),
        telephone: CONTACT.phoneDisplay.replace(/\s+/g, ''),
        email: CONTACT.email,
        address: {
          '@type': 'PostalAddress',
          addressLocality: LOCATION.city[locale],
          addressRegion: locale === 'ar' ? 'منطقة الرياض' : 'Riyadh Province',
          addressCountry: LOCATION.country,
        },
        ...(hasPin
          ? { geo: { '@type': 'GeoCoordinates', latitude: LOCATION.lat, longitude: LOCATION.lng } }
          : {}),
        hasMap: LOCATION.mapsUrl,
        areaServed: { '@type': 'Country', name: locale === 'ar' ? 'المملكة العربية السعودية' : 'Saudi Arabia' },
        knowsLanguage: ['ar', 'en'],
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
            opens: '09:00',
            closes: '18:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Saturday',
            opens: '10:00',
            closes: '16:00',
          },
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'sales',
          telephone: CONTACT.phoneDisplay.replace(/\s+/g, ''),
          email: CONTACT.email,
          areaServed: 'SA',
          availableLanguage: ['Arabic', 'English'],
        },
        sameAs: SOCIAL_LINKS.map((link) => link.href),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        url: absoluteUrl(locale === 'ar' ? '/ar' : '/en'),
        name: names.name,
        inLanguage: locale === 'ar' ? 'ar-SA' : 'en',
        publisher: { '@id': absoluteUrl('/#organization') },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absoluteUrl(getPathname({ locale, href: '/products' }))}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

/** Serialises JSON-LD safely for a <script> tag (`<` escaped). */
export function jsonLdHtml(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
