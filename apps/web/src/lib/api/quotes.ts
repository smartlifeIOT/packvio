import type {
  CreateQuoteRequestDto,
  QuoteRequestAcknowledgementDto,
} from '@packvio/shared';

/**
 * Submits an RFQ — the site's primary conversion.
 *
 * Posts to `/api/quote` on the SITE'S OWN ORIGIN, which forwards to the Nest API
 * over the internal container network. It used to post cross-origin straight to
 * the API; the objection to proxying was that it would collapse the API's per-IP
 * rate limit onto the web server's single address, and that is answered in the
 * route handler by forwarding the client's `X-Forwarded-For` unchanged. Read the
 * note there before touching either side.
 *
 * What the move buys: no CORS on the conversion path, no requirement that the
 * API be reachable from a visitor's network, and a form that keeps working
 * behind staging's HTTP Basic Auth — where a cross-origin preflight to a
 * 401-protected API would fail before the buyer saw anything.
 */

export type QuoteSubmissionResult =
  | { ok: true; acknowledgement: QuoteRequestAcknowledgementDto }
  | { ok: false; kind: 'validation'; messages: string[] }
  | { ok: false; kind: 'rateLimited' }
  | { ok: false; kind: 'network' | 'server' };

/**
 * Same-origin, and therefore a relative path — no environment variable at all.
 *
 * That absence is the point: an origin baked in at build time is an origin that
 * has to be right for every environment the image is deployed to, and the form
 * is the one place where getting it wrong loses a sale rather than a page view.
 */
const QUOTE_ENDPOINT = '/api/quote';

/**
 * Never throws. Every failure is a value the form can render.
 *
 * A rejected promise here would surface as the route's error boundary, which
 * would replace a filled-in form with an error page and discard everything the
 * buyer typed. The distinctions matter to the reader: a validation problem is
 * fixable in place, a rate limit means "you already sent this", and a network
 * failure means "try again" — three different messages, not one.
 */
export async function submitQuoteRequest(
  payload: CreateQuoteRequestDto,
): Promise<QuoteSubmissionResult> {
  let response: Response;

  try {
    response = await fetch(QUOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }

  if (response.ok) {
    try {
      const acknowledgement = (await response.json()) as QuoteRequestAcknowledgementDto;
      // The reference is the ONE thing the thank-you screen exists to show. A
      // 201 without it means something upstream changed shape, and claiming
      // success while showing a blank reference is worse than reporting a fault.
      if (!acknowledgement?.reference) return { ok: false, kind: 'server' };
      return { ok: true, acknowledgement };
    } catch {
      return { ok: false, kind: 'server' };
    }
  }

  if (response.status === 429) return { ok: false, kind: 'rateLimited' };

  /**
   * A gateway status means the proxy is up and the API behind it is not, which
   * for the buyer is the same situation as a dropped connection: nothing they
   * typed was wrong and trying again may well work. Reporting it as `server`
   * would tell them their submission failed for good.
   */
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return { ok: false, kind: 'network' };
  }

  if (response.status === 400) {
    try {
      const body: unknown = await response.json();
      const message = (body as { message?: unknown }).message;
      const messages =
        typeof message === 'string'
          ? [message]
          : Array.isArray(message)
            ? message.filter((entry): entry is string => typeof entry === 'string')
            : [];
      return { ok: false, kind: 'validation', messages };
    } catch {
      return { ok: false, kind: 'validation', messages: [] };
    }
  }

  return { ok: false, kind: 'server' };
}
