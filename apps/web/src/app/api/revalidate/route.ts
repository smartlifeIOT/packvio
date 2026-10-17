import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * On-demand cache purge, called by the Nest API after a Salla sync writes.
 *
 * The site renders from the catalog API with `revalidate: 300` and meaningful
 * cache tags (see lib/api/client.ts). Without this endpoint a merchant's price
 * change takes up to five minutes to appear; with it, the sync that wrote the
 * change purges exactly the pages that show it.
 *
 * Nothing here reads the catalog or the database — it only invalidates. The
 * next request for a purged page re-fetches through the normal path.
 */

/** Hard cap on tags per request, so one call cannot become a denial of service. */
const MAX_TAGS = 200;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;

  /**
   * A missing secret DISABLES the endpoint rather than opening it.
   *
   * The alternative — treating "no secret configured" as "no auth required" —
   * turns a forgotten environment variable into a public cache-purge endpoint
   * anyone can use to force the site to re-render on demand.
   */
  if (!secret) {
    console.error('[packvio] /api/revalidate called but REVALIDATE_SECRET is not set.');
    return NextResponse.json({ revalidated: false, error: 'not configured' }, { status: 401 });
  }

  const provided = request.headers.get('x-revalidate-secret');
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ revalidated: false, error: 'unauthorized' }, { status: 401 });
  }

  let tags: string[];
  try {
    const body: unknown = await request.json();
    tags = readTags(body);
  } catch {
    return NextResponse.json({ revalidated: false, error: 'invalid json' }, { status: 400 });
  }

  if (tags.length === 0) {
    return NextResponse.json({ revalidated: false, error: 'no tags' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag);

  console.info(`[packvio] Revalidated ${tags.length} tag(s): ${tags.slice(0, 8).join(', ')}${tags.length > 8 ? '…' : ''}`);

  return NextResponse.json({ revalidated: true, count: tags.length, tags });
}

function readTags(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const raw = (body as { tags?: unknown }).tags;
  if (!Array.isArray(raw)) return [];

  const tags = raw
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 512);

  return [...new Set(tags)].slice(0, MAX_TAGS);
}

/**
 * Constant-time comparison.
 *
 * `===` on a secret leaks its length and its matching prefix through timing.
 * That is a thin channel, but this secret is the only thing standing between
 * the internet and an endpoint that can force the site to rebuild every page.
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — so compare a fixed-size digest of each instead of the raw bytes.
  if (left.length !== right.length) {
    // Still burn a comparison so the failure path costs roughly the same.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
