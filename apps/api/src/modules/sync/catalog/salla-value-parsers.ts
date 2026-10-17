/**
 * Tolerant readers for the Salla fields whose exact shape is not pinned down.
 *
 * Salla's admin v2 responses are not versioned per field, and the same logical
 * value arrives in more than one shape depending on the endpoint and the
 * release: money is sometimes `{ amount, currency }` and sometimes a bare
 * number; a timestamp is sometimes a Laravel `{ date, timezone }` object and
 * sometimes an ISO string; an image is sometimes an object and sometimes a URL.
 *
 * Rather than guess one shape and break on the other, every uncertain field is
 * read through a function here that accepts both and returns `null` when it can
 * make no sense of the input. `null` is the important part: a parser that
 * guesses a zero would make the site advertise a free product.
 *
 * These are pure and separately tested so the shape question stays in one file
 * — when a real delivery settles it, this is the only place to correct.
 */

/** A value that is neither `null` nor `undefined`. */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParsedMoney {
  /** `null` when Salla sent no price. NEVER 0 as a stand-in. */
  amount: number | null;
  /** `null` when the shape carried no currency of its own. */
  currency: string | null;
}

/**
 * Money, from either `{ amount, currency }` or a bare number.
 *
 * A bare number carries no currency, so the caller supplies the fallback from
 * the payload's top-level `currency` — which is why this returns the currency
 * separately instead of defaulting it here.
 *
 * `0` is preserved as a real zero when Salla actually sent one; only absent,
 * null and unparseable values become `null`. Salla does use `{ amount: 0 }` for
 * "no sale price", so callers treating a sale price of 0 as "none" must say so
 * themselves — see `parseSalePrice`.
 */
export function parseMoney(value: unknown): ParsedMoney {
  if (!isPresent(value)) return { amount: null, currency: null };

  if (typeof value === 'number') {
    return { amount: Number.isFinite(value) ? value : null, currency: null };
  }

  // Salla occasionally serialises a decimal as a string ("42.50").
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return { amount: value.trim() !== '' && Number.isFinite(parsed) ? parsed : null, currency: null };
  }

  if (isRecord(value)) {
    const raw = value.amount;
    const amount =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
          ? Number(raw)
          : null;
    const currency = typeof value.currency === 'string' ? value.currency.toUpperCase() : null;
    return { amount: Number.isFinite(amount ?? Number.NaN) ? amount : null, currency };
  }

  return { amount: null, currency: null };
}

/**
 * A sale price, with Salla's "no sale" sentinel folded to null.
 *
 * Salla sends `{ amount: 0 }` rather than omitting the field when a product has
 * no discount. Storing that verbatim would show every product as reduced to
 * zero — so 0 means "no sale price" here, which is the one place a falsy amount
 * is deliberately not preserved.
 */
export function parseSalePrice(value: unknown): ParsedMoney {
  const parsed = parseMoney(value);
  if (parsed.amount === 0) return { amount: null, currency: parsed.currency };
  return parsed;
}

/**
 * A timestamp, from an ISO string or a Laravel `{ date, timezone_type, timezone }`.
 *
 * The timezone matters more than it looks. `'2026-08-19 08:00:00.000000'` has
 * no offset, so `new Date()` reads it in the SERVER's zone — and this value is
 * the sole input to the out-of-order guard. A three-hour skew between a
 * UTC container and an Asia/Riyadh timestamp is exactly enough to let a stale
 * webhook look newer than the row it is about to overwrite.
 */
export function parseSallaDate(value: unknown): Date | null {
  if (!isPresent(value)) return null;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    // Seconds vs milliseconds: anything below ~1e12 is a second-precision epoch.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') return fromDateString(value, null);

  if (isRecord(value)) {
    const date = typeof value.date === 'string' ? value.date : null;
    if (!date) return null;
    const zone = typeof value.timezone === 'string' ? value.timezone : null;
    return fromDateString(date, zone);
  }

  return null;
}

/**
 * Parses a date string, interpreting a naive one (no offset, no `Z`) as being
 * in `timeZone` — falling back to UTC rather than to the server's local zone,
 * because "wherever this container happens to run" is never the right answer.
 */
function fromDateString(input: string, timeZone: string | null): Date | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (hasOffset) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Naive: normalise "YYYY-MM-DD HH:MM:SS[.ffffff]" to an ISO-ish form and read
  // it as UTC, then shift by the named zone's offset at that instant.
  const isoish = trimmed.replace(' ', 'T');
  const asUtc = new Date(`${isoish}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  if (!timeZone) return asUtc;

  const offset = zoneOffsetMinutes(asUtc, timeZone);
  if (offset === null) return asUtc;

  // The wall-clock reading was in `timeZone`, so the real instant is earlier by
  // that zone's offset east of UTC.
  return new Date(asUtc.getTime() - offset * 60_000);
}

/**
 * Minutes that `timeZone` is ahead of UTC at `instant`.
 *
 * Computed through Intl rather than a hard-coded +03:00 for Riyadh: the store
 * could be configured to any zone, and a zone with DST would make a constant
 * wrong for half the year.
 */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = new Map<string, string>(
      formatter.formatToParts(instant).map((part) => [String(part.type), part.value]),
    );

    const get = (key: string): number => Number(parts.get(key) ?? Number.NaN);
    // Intl renders midnight as hour "24" in some engines; normalise it.
    const hour = get('hour') === 24 ? 0 : get('hour');

    const asIfUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      hour,
      get('minute'),
      get('second'),
    );
    if (Number.isNaN(asIfUtc)) return null;

    return Math.round((asIfUtc - instant.getTime()) / 60_000);
  } catch {
    // An unknown IANA zone name throws — better to fall back to UTC than to
    // reject a whole webhook over a timezone label.
    return null;
  }
}

/** Salla booleans arrive as real booleans, 0/1, or "true"/"false". */
export function parseBoolean(value: unknown): boolean | null {
  if (!isPresent(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

/** An integer, tolerating a numeric string. Non-integers are rejected, not floored. */
export function parseInteger(value: unknown): number | null {
  if (!isPresent(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) ? parsed : null;
}

/** Trimmed non-empty string, or null. Empty strings are absence, not content. */
export function parseText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A URL from either a bare string or an object carrying `url`.
 *
 * Covers `main_image` and a category's `image`, which appear in both forms.
 */
export function parseUrl(value: unknown): string | null {
  if (typeof value === 'string') return parseText(value);
  if (isRecord(value)) return parseText(value.url);
  return null;
}

export interface ParsedImage {
  /** Salla's image id, as a string — bigint-safe. Null when it sent none. */
  sallaId: string | null;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * The gallery, from `images[]` plus `main_image`.
 *
 * Reconciliation is by URL, not by Salla id: `main_image` in its bare-string
 * form carries no id at all, and an image that appears both there and in
 * `images[]` must collapse to one row rather than two. The URL is the only
 * identifier present in every shape.
 *
 * `main_image` also decides `isPrimary` when no entry claims `main: true`,
 * because the lean payload shape marks the primary only by repeating its URL
 * at the top level.
 */
export function parseImages(payload: Record<string, unknown>): ParsedImage[] {
  const mainUrl = parseUrl(payload.main_image);
  const raw = Array.isArray(payload.images) ? payload.images : [];

  const byUrl = new Map<string, ParsedImage>();

  for (const [index, entry] of raw.entries()) {
    const url = parseUrl(entry);
    if (!url) continue;

    const record = isRecord(entry) ? entry : {};
    const existing = byUrl.get(url);
    const sortOrder = parseInteger(record.sort) ?? index;
    const flaggedMain = parseBoolean(record.main) ?? false;

    if (existing) {
      // A duplicate URL keeps the earliest position but inherits a main flag.
      existing.isPrimary = existing.isPrimary || flaggedMain;
      existing.sallaId = existing.sallaId ?? stringifyId(record.id);
      continue;
    }

    byUrl.set(url, {
      sallaId: stringifyId(record.id),
      url,
      sortOrder,
      isPrimary: flaggedMain,
    });
  }

  // main_image not present in images[] is still a real image.
  if (mainUrl && !byUrl.has(mainUrl)) {
    const record = isRecord(payload.main_image) ? payload.main_image : {};
    byUrl.set(mainUrl, {
      sallaId: stringifyId(record.id),
      url: mainUrl,
      sortOrder: -1,
      isPrimary: true,
    });
  }

  const images = [...byUrl.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  // Exactly one primary. Prefer an explicit main flag, then main_image, then
  // the first image — a gallery with no primary renders no card thumbnail.
  const explicit = images.find((image) => image.isPrimary && image.url === mainUrl);
  const anyFlagged = images.find((image) => image.isPrimary);
  const chosen = explicit ?? anyFlagged ?? images.find((image) => image.url === mainUrl) ?? images[0];

  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
    isPrimary: chosen !== undefined && image.url === chosen.url,
  }));
}

/** Salla ids are bigints; carrying them as strings avoids 2^53 truncation. */
export function stringifyId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return null;
}

/**
 * Category ids from `categories[]`, in either shape: objects carrying `id`, or
 * bare numeric ids.
 */
export function parseCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids = value
    .map((entry) => (isRecord(entry) ? stringifyId(entry.id) : stringifyId(entry)))
    .filter((id): id is string => id !== null);

  return [...new Set(ids)];
}
