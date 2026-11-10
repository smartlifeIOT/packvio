import type { MetadataRoute } from 'next';
import type { CatalogProductSummaryDto } from '@packvio/shared';
import { getPathname } from '@/i18n/navigation';
import type { StaticAppPathname } from '@/i18n/routing';
import { getCategories, getProducts } from '@/lib/api';
import { absoluteUrl } from '@/lib/seo';

/**
 * /sitemap.xml — every public page in BOTH languages, each entry carrying its
 * hreflang twin, so search engines index the Arabic and English pages as
 * translations of each other rather than as duplicates.
 *
 * Every product SKU is listed, not just one per listing card: each colour and
 * size has its own page and its own search intent ("black plastic fork").
 * Rendered on request and cached for an hour.
 */
export const revalidate = 3600;

const STATIC_PAGES: { href: StaticAppPathname; priority: number }[] = [
  { href: '/', priority: 1 },
  { href: '/products', priority: 0.9 },
  { href: '/custom-printing', priority: 0.8 },
  { href: '/quote', priority: 0.7 },
  { href: '/about', priority: 0.6 },
  { href: '/contact', priority: 0.6 },
  { href: '/faq', priority: 0.5 },
];

type Pair = { ar: string; en: string };

function entry(paths: Pair, priority: number, changeFrequency: 'weekly' | 'monthly') {
  // Arabic paths are percent-encoded: a sitemap is XML read by machines, and
  // raw Arabic in a <loc> is rejected by some validators.
  const encode = (path: string) => absoluteUrl(encodeURI(safeDecode(path)));
  const languages = { ar: encode(paths.ar), en: encode(paths.en) };
  // One <url> per language, each listing both — Google's documented form.
  return (['ar', 'en'] as const).map((locale) => ({
    url: languages[locale],
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

async function allProducts(): Promise<CatalogProductSummaryDto[]> {
  const items: CatalogProductSummaryDto[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await getProducts('ar', { page, perPage: 60 });
    items.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];

  for (const page of STATIC_PAGES) {
    urls.push(
      ...entry(
        {
          ar: getPathname({ locale: 'ar', href: page.href }),
          en: getPathname({ locale: 'en', href: page.href }),
        },
        page.priority,
        'weekly',
      ),
    );
  }

  try {
    const categories = await getCategories('ar');
    for (const category of categories) {
      urls.push(
        ...entry(
          {
            ar: getPathname({ locale: 'ar', href: { pathname: '/categories/[slug]', params: { slug: category.slug } } }),
            en: getPathname({ locale: 'en', href: { pathname: '/categories/[slug]', params: { slug: category.alternateSlug } } }),
          },
          0.8,
          'weekly',
        ),
      );
    }

    // Cards collapse variant families; their members carry every SKU's slugs.
    const seen = new Set<string>();
    for (const card of await allProducts()) {
      const members = card.variantGroup?.variants ?? [card];
      for (const member of members) {
        if (seen.has(member.code)) continue;
        seen.add(member.code);
        urls.push(
          ...entry(
            {
              ar: getPathname({ locale: 'ar', href: { pathname: '/product/[slug]', params: { slug: member.slug } } }),
              en: getPathname({ locale: 'en', href: { pathname: '/product/[slug]', params: { slug: member.alternateSlug } } }),
            },
            0.7,
            'monthly',
          ),
        );
      }
    }
  } catch {
    // The API being briefly unreachable must not take /sitemap.xml down with
    // it; the static pages above are still worth serving.
  }

  return urls;
}
