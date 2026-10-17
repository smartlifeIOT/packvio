import { NextResponse } from 'next/server';

/**
 * Server-side proxy for the RFQ — the site's primary conversion.
 *
 * THIS REVERSES AN EARLIER DECISION, deliberately. The form used to POST from
 * the browser straight to the Nest API, and the reason was the rate limit: the
 * API counts submissions per client IP, and a naive proxy makes every submission
 * on earth arrive from the web container's single address, so the fifth RFQ of
 * the hour from anyone throttles everyone.
 *
 * That objection is answered rather than ignored — see `forwardedFor` below. In
 * exchange, the conversion path loses its dependency on CORS entirely: the
 * browser now talks to its own origin, the API needs no public CORS allowance
 * for `/quotes`, and `NEXT_PUBLIC_API_URL` no longer has to be reachable from a
 * visitor's network at all. On a staging box behind HTTP Basic Auth that last
 * point is what makes the form work: a cross-origin POST to a 401-protected API
 * would fail the preflight before the buyer ever saw an error.
 *
 * Deliberately uncached, and no `revalidate`: this is a write.
 */
export const dynamic = 'force-dynamic';

/**
 * Where the API lives from INSIDE the container network.
 *
 * `API_INTERNAL_URL` (e.g. `http://api:4000/api/v1`) is a runtime variable, not
 * a `NEXT_PUBLIC_` one, because nothing in the browser may learn it — the API is
 * not published to the host and only nginx and this handler can reach it. The
 * fallback keeps `npm run dev:web` working unchanged against a local API.
 */
function apiBaseUrl(): string {
  const configured = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configured) {
    throw new Error(
      'Neither API_INTERNAL_URL nor NEXT_PUBLIC_API_URL is set — the quote proxy has nowhere to forward to.',
    );
  }
  return configured.replace(/\/+$/, '');
}

/**
 * The client's address, passed through UNCHANGED — not appended to.
 *
 * This is the whole reason the rate limit survives the move, and the one line to
 * get right. The API runs Express with `trust proxy = 1`, meaning it trusts
 * exactly one hop and reads the client as the last untrusted entry. nginx sets
 * `X-Forwarded-For` to the real peer and nothing else, so the header arriving
 * here holds exactly one address.
 *
 * Forward that value as-is and the API sees `[client]` with this container as
 * the single trusted hop — identical to what it saw when nginx proxied straight
 * to it, so `trust proxy = 1` stays correct for both paths and the per-IP
 * counter keeps counting real people.
 *
 * APPEND to it — the instinct, and what a proxy library would do for you — and
 * the API reads the LAST untrusted entry as this container's address instead.
 * Every RFQ in the world then shares one bucket and the limit becomes a global
 * five per hour. That failure is invisible in testing, where there is only ever
 * one submitter.
 */
function forwardedFor(request: Request): Record<string, string> {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  const headers: Record<string, string> = {};
  if (forwarded) headers['x-forwarded-for'] = forwarded;
  else if (realIp) headers['x-forwarded-for'] = realIp;
  if (realIp) headers['x-real-ip'] = realIp;

  return headers;
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Malformed request body.' }, { status: 400 });
  }

  /**
   * The body is forwarded WITHOUT being validated here.
   *
   * Not an oversight: the API validates it with class-validator against the DTO
   * that the database columns are derived from, and a second, necessarily
   * simplified copy of those rules in this file would be a copy that drifts —
   * rejecting something the API would have accepted, or worse, accepting
   * something and reporting a shape the form cannot render. One validator, at
   * the boundary that owns the data.
   */
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/quotes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        // The submitter's own user agent, not Node's — the API stores it
        // alongside the lead as an abuse signal, and "node" for every row
        // would make that column worthless.
        'user-agent': request.headers.get('user-agent') ?? 'unknown',
        ...forwardedFor(request),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    // The API being unreachable is a 502, not a 500: this handler is fine, the
    // thing behind it is not, and the form's "network" message is the right
    // thing for the buyer to see.
    return NextResponse.json({ message: 'The quote service is unavailable.' }, { status: 502 });
  }

  /**
   * Status and body are passed through verbatim, because the form already
   * distinguishes 201 / 400 / 429 and renders a different message for each.
   * Collapsing them here — returning 200 with an `ok` flag, say — would mean
   * re-encoding those cases and teaching the form a second vocabulary for the
   * same three outcomes.
   */
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // Never store a lead acknowledgement anywhere.
      'cache-control': 'no-store',
    },
  });
}
