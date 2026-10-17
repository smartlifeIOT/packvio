import { headers } from 'next/headers';
import type { Locale } from '@packvio/shared';
import { findCategory, findProduct } from '@/lib/api';
import { getPathname } from '@/i18n/navigation';
import { locales, otherLocale, pathnames, type AppPathname } from '@/i18n/routing';
import { PATHNAME_HEADER } from '@/middleware';

/**
 * Where the language switcher should send the reader, resolved ON THE SERVER.
 *
 * This used to be a client effect: the page rendered `<SetLocaleAlternates>`,
 * which pushed the alternate slug into a context after hydration. It worked for
 * a reader with JavaScript, but the href in the initial HTML was `/en` — the
 * home-page fallback — so a click before hydration, and every crawler, got the
 * wrong destination on exactly the pages where getting it right matters most.
 *
 * Doing it here removes the whole class of problem: the anchor is correct in the
 * first byte of HTML, there is no effect to run, and no state to clear when the
 * reader navigates away.
 *
 * The cost is one extra API call on dynamic routes — and in practice not even
 * that. The layout resolves the SAME product or category the page below it is
 * about to fetch, with the same URL and the same cache tags, so Next's data
 * cache serves the second call from the first. See lib/api/client.ts.
 */

/** Reverse of next-intl's `pathnames`: a real URL back to an internal route. */
type Match = { pathname: AppPathname; slug?: string };

/**
 * Turns `/ar/الفئات/اكواب-قهوة-ورقية` back into
 * `{ pathname: '/categories/[slug]', slug: 'اكواب-قهوة-ورقية' }`.
 *
 * Written as an explicit reverse lookup over the `pathnames` table rather than
 * a regex per route, so adding a localized route to that table is the only edit
 * needed — a second place to update is a second place to forget.
 */
export function matchPathname(pathname: string, locale: Locale): Match | null {
  const segments = pathname.split('/').filter(Boolean);
  // Drop the locale prefix; what remains is the localized route.
  const rest = (locales as readonly string[]).includes(segments[0] ?? '')
    ? segments.slice(1)
    : segments;

  if (rest.length === 0) return { pathname: '/' };

  for (const [internal, localized] of Object.entries(pathnames)) {
    const template = typeof localized === 'string' ? localized : localized[locale];
    const parts = template.split('/').filter(Boolean);
    if (parts.length !== rest.length) continue;

    let slug: string | undefined;
    const matches = parts.every((part, index) => {
      const actual = rest[index];
      if (actual === undefined) return false;
      if (part === '[slug]') {
        slug = decodeURIComponent(actual);
        return true;
      }
      return decodeURIComponent(part) === decodeURIComponent(actual);
    });

    if (matches) return { pathname: internal as AppPathname, slug };
  }

  return null;
}

/**
 * The href for "switch to the other language", for the CURRENT request.
 *
 * Falls back to the other locale's home page only when there is genuinely no
 * equivalent — an unmatched route, or a slug the API cannot resolve. That is a
 * backstop, not the design.
 */
export async function resolveAlternateHref(locale: Locale): Promise<string> {
  const target = otherLocale(locale);
  const requestHeaders = await headers();
  const pathname = requestHeaders.get(PATHNAME_HEADER);

  if (!pathname) return `/${target}`;

  const match = matchPathname(pathname, locale);
  if (!match) return `/${target}`;

  // A static route: next-intl translates the segment on its own.
  if (!match.slug) {
    return getPathname({ locale: target, href: match.pathname as never });
  }

  /**
   * A dynamic route: the slug itself is translated, and only the API knows what
   * into.
   *
   * The `find*` variants are used deliberately, NOT `*OrNotFound`. Those call
   * Next's `notFound()`, and a layout that 404s takes the whole route with it —
   * including the page below, which is about to handle the missing slug itself
   * and render a proper 404. A null here just means "no equivalent", which is
   * exactly what the fallback is for.
   */
  const entity =
    match.pathname === '/product/[slug]'
      ? await findProduct(match.slug, locale)
      : await findCategory(match.slug, locale);

  if (!entity) return `/${target}`;

  return getPathname({
    locale: target,
    href: { pathname: match.pathname, params: { slug: entity.alternateSlug } } as never,
  });
}
