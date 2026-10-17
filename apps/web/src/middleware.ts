import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

/**
 * The pathname the reader actually requested, forwarded to the server tree.
 *
 * Next gives a LAYOUT no way to see the current URL — only the page below it
 * gets `params`. The header, and therefore the language switcher, renders in
 * the layout. Without this the switcher cannot know it is on
 * `/ar/الفئات/اكواب-قهوة-ورقية` and has nothing to offer but the home page,
 * which is the single most common way a bilingual site loses someone mid-visit.
 */
export const PATHNAME_HEADER = 'x-pathname';

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  /**
   * The header is added to the REQUEST and next-intl is then asked to route
   * that request, so its rewrite carries the header down to the server tree.
   * `headers()` in a server component reads the incoming request, so setting
   * this on the returned response instead would be invisible to the layout —
   * it would reach the browser and nothing else.
   *
   * `nextUrl.pathname` rather than `request.url`: already decoded and stripped
   * of the basePath, which is the form the switcher compares against
   * next-intl's own pathname table.
   */
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);

  return handleI18nRouting(new NextRequest(request, { headers }));
}

export const config = {
  // Run on every path except Next internals, the API proxy and static files.
  matcher: ['/', '/(ar|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
