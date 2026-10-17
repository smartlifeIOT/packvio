/**
 * Campaign attribution, captured on arrival and read at submission.
 *
 * The problem this solves: someone clicks a Google ad onto a product page, then
 * browses for ten minutes before submitting an RFQ from `/quote`. By then the
 * `utm_*` parameters are long gone from the URL, and the lead lands in the
 * database with no idea which campaign produced it — which makes every ad spend
 * decision guesswork.
 *
 * So the parameters are stashed the first time they are seen and travel with
 * the session.
 *
 * sessionStorage, ONLY sessionStorage — the same rule as the quote basket. A
 * persistent attribution cookie is exactly the kind of cross-visit tracking
 * that needs a consent banner; a tab-scoped record of how THIS visit began is
 * strictly necessary to fulfil the request the user is making and does not.
 * The trade is that attribution does not survive closing the tab, which for a
 * single-session conversion funnel costs nothing real.
 */

const STORAGE_KEY = 'packvio.utm.v1';

export type UtmParams = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export const EMPTY_UTM: UtmParams = { utmSource: null, utmMedium: null, utmCampaign: null };

/** Values are attacker-supplied URL text bound for a varchar(120) column. */
function clean(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads `utm_*` off the current URL and stores them if present.
 *
 * FIRST TOUCH WINS: an existing record is not overwritten. A visitor who
 * arrives from an ad and later clicks an internal link carrying its own
 * campaign tag should still be attributed to the ad that brought them, which is
 * the question "which spend produced this lead" is actually asking.
 */
export function captureUtm(search: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;

    const params = new URLSearchParams(search);
    const captured: UtmParams = {
      utmSource: clean(params.get('utm_source')),
      utmMedium: clean(params.get('utm_medium')),
      utmCampaign: clean(params.get('utm_campaign')),
    };

    // Nothing to remember, and writing an all-null record would lock out the
    // real campaign parameters on a later page in the same session.
    if (!captured.utmSource && !captured.utmMedium && !captured.utmCampaign) return;

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // Storage blocked or full — attribution is a nice-to-have, never a reason
    // to break the page it was captured on.
  }
}

export function readUtm(): UtmParams {
  if (typeof window === 'undefined') return EMPTY_UTM;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_UTM;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_UTM;

    const record = parsed as Partial<UtmParams>;
    return {
      utmSource: clean(record.utmSource ?? null),
      utmMedium: clean(record.utmMedium ?? null),
      utmCampaign: clean(record.utmCampaign ?? null),
    };
  } catch {
    return EMPTY_UTM;
  }
}
