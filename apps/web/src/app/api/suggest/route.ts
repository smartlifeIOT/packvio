import { NextResponse } from 'next/server';
import { getSuggestions } from '@/lib/api';
import { isLocale } from '@/i18n/routing';

/**
 * Server-side proxy for the header autocomplete.
 *
 * The browser could call the catalog API directly — NEXT_PUBLIC_API_URL is
 * public and CORS allows this origin — but proxying is better on three counts:
 * the API's address never has to be reachable from a visitor's network, the
 * request cannot be blocked by a CORS misconfiguration in some future
 * deployment, and the query is validated before it reaches the catalog.
 *
 * Deliberately uncached: this is typed into on every keystroke, so an ISR entry
 * per query string would be cache pollution with no hit rate to justify it.
 */
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 8;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const requestedLocale = searchParams.get('locale') ?? 'ar';
  const locale = isLocale(requestedLocale) ? requestedLocale : 'ar';

  if (q.length === 0) {
    return NextResponse.json([]);
  }

  try {
    const suggestions = await getSuggestions(locale, q, MAX_LIMIT);
    return NextResponse.json(suggestions);
  } catch {
    // A failing autocomplete must never break typing. The dropdown simply shows
    // nothing, and the reader can still submit the search.
    return NextResponse.json([], { status: 200 });
  }
}
