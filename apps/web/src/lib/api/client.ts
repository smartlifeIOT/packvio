import type { Locale } from '@packvio/shared';
import { ApiError, ApiNotFoundError, ApiUnreachableError } from './errors';

/**
 * The one place the site talks to the catalog API.
 *
 * No component calls fetch directly. Everything goes through here so that four
 * things are true everywhere at once, rather than true wherever someone
 * remembered: the locale is always sent, the ISR revalidation window is always
 * set, the cache tags are always meaningful, and a 404 is always distinguishable
 * from a failure.
 */

/** ISR window. The catalog changes a few times a day; five minutes is generous. */
export const CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Cache tags.
 *
 * Nest will call Next's on-demand revalidation after a Salla sync writes, so the
 * tags have to be things the API can name from its side without knowing which
 * pages exist. `catalog` is the blunt instrument for a full reconcile;
 * `product:<slug>` and `category:<slug>` let a single webhook invalidate exactly
 * the pages that changed.
 */
export const CACHE_TAGS = {
  catalog: 'catalog',
  product: (slug: string) => `product:${slug}`,
  category: (slug: string) => `category:${slug}`,
} as const;

/**
 * Where the catalog API lives, from the SERVER's point of view.
 *
 * Every caller of `apiFetch` is server-side — server components, the metadata
 * helpers, the two route handlers — so the address that matters is the one the
 * Next process can reach, not the one a browser could.
 *
 * `API_INTERNAL_URL` is preferred and is a runtime variable: in Docker it is
 * `http://api:4000/api/v1`, a name that only resolves inside the container
 * network, and the API is deliberately not published to the host. It cannot be a
 * `NEXT_PUBLIC_` value because those are frozen into the bundle at BUILD time —
 * one image would then be pinned to one deployment's API address, which is the
 * mistake this indirection exists to avoid.
 *
 * `NEXT_PUBLIC_API_URL` remains the fallback so `npm run dev:web` against a
 * local API keeps working with no extra configuration.
 */
function baseUrl(): string {
  const configured = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configured) {
    throw new Error(
      'Neither API_INTERNAL_URL nor NEXT_PUBLIC_API_URL is set. One must point at the ' +
        'catalog API including the /api/v1 prefix, e.g. http://localhost:4000/api/v1',
    );
  }
  return configured.replace(/\/+$/, '');
}

export type QueryValue = string | number | boolean | string[] | undefined | null;

export type ApiRequest = {
  /** Path below the API base, e.g. `/catalog/products`. */
  path: string;
  locale: Locale;
  query?: Record<string, QueryValue>;
  /** Tags this response should be invalidated by. `catalog` is always added. */
  tags?: string[];
  revalidate?: number;
};

function buildUrl({ path, locale, query }: ApiRequest): string {
  const url = new URL(`${baseUrl()}${path}`);
  url.searchParams.set('locale', locale);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;

    /**
     * An array becomes REPEATED parameters (`?category=a&category=b`) rather
     * than one comma-joined value. The API accepts both, but a slug containing
     * a comma would silently split under the joined form — and the repeated
     * form is what the URL in the address bar already looks like, so the
     * request and the page's own links stay legible as the same thing.
     */
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== '') url.searchParams.append(key, entry);
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export async function apiFetch<T>(request: ApiRequest): Promise<T> {
  const url = buildUrl(request);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      next: {
        revalidate: request.revalidate ?? CATALOG_REVALIDATE_SECONDS,
        // `catalog` on every response, so a full reconcile can invalidate the
        // whole site with one call and nothing gets missed.
        tags: [CACHE_TAGS.catalog, ...(request.tags ?? [])],
      },
    });
  } catch (cause) {
    throw new ApiUnreachableError(url, cause);
  }

  if (response.status === 404) {
    throw new ApiNotFoundError(url, `Not found: ${request.path}`);
  }

  if (!response.ok) {
    // The API's error body is { statusCode, message, error }; surface `message`
    // when it is there, because "Bad Request" alone tells a developer nothing.
    const detail = await readErrorMessage(response);
    throw new ApiError(
      response.status,
      url,
      `Catalog API returned ${response.status} for ${request.path}${detail ? `: ${detail}` : ''}`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ApiError(response.status, url, `Catalog API returned a non-JSON body for ${request.path}`, {
      cause,
    });
  }
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
    return null;
  } catch {
    return null;
  }
}
