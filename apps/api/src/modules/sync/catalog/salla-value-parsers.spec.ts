import {
  parseBoolean,
  parseInteger,
  parseMoney,
  parseSalePrice,
  parseSallaDate,
  parseText,
  parseUrl,
  stringifyId,
  zoneOffsetMinutes,
} from './salla-value-parsers';

describe('Salla value parsers', () => {
  describe('parseSallaDate', () => {
    it('reads an ISO string with an offset', () => {
      expect(parseSallaDate('2026-08-19T10:30:00+03:00')?.toISOString()).toBe(
        '2026-08-19T07:30:00.000Z',
      );
    });

    it('reads a Laravel object and honours its timezone', () => {
      // 08:00 in Riyadh (UTC+3) is 05:00Z. Reading it as local time on a UTC
      // container would give 08:00Z — a three-hour error, which is exactly
      // enough to let a stale webhook beat the row it is overwriting.
      const parsed = parseSallaDate({
        date: '2026-08-19 08:00:00.000000',
        timezone_type: 3,
        timezone: 'Asia/Riyadh',
      });
      expect(parsed?.toISOString()).toBe('2026-08-19T05:00:00.000Z');
    });

    it('falls back to UTC for a naive string with no timezone, never to server local', () => {
      expect(parseSallaDate('2026-08-19 08:00:00')?.toISOString()).toBe(
        '2026-08-19T08:00:00.000Z',
      );
    });

    it('survives an unknown IANA zone rather than rejecting the delivery', () => {
      const parsed = parseSallaDate({ date: '2026-08-19 08:00:00', timezone: 'Mars/Olympus' });
      expect(parsed?.toISOString()).toBe('2026-08-19T08:00:00.000Z');
    });

    it('handles a zone WEST of UTC, so the sign is not accidentally hard-coded', () => {
      // 08:00 in New York (UTC-4 in August) is 12:00Z.
      const parsed = parseSallaDate({ date: '2026-08-19 08:00:00', timezone: 'America/New_York' });
      expect(parsed?.toISOString()).toBe('2026-08-19T12:00:00.000Z');
    });

    it('reads epoch seconds and epoch milliseconds', () => {
      expect(parseSallaDate(1_755_000_000)?.getTime()).toBe(1_755_000_000_000);
      expect(parseSallaDate(1_755_000_000_000)?.getTime()).toBe(1_755_000_000_000);
    });

    it('returns null for absent or unparseable values', () => {
      expect(parseSallaDate(null)).toBeNull();
      expect(parseSallaDate(undefined)).toBeNull();
      expect(parseSallaDate('')).toBeNull();
      expect(parseSallaDate('not a date')).toBeNull();
      expect(parseSallaDate({ nothing: true })).toBeNull();
    });

    it('reports Riyadh as a constant +180, since it has no DST', () => {
      expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Asia/Riyadh')).toBe(180);
      expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Riyadh')).toBe(180);
    });
  });

  describe('parseMoney', () => {
    it('reads the object shape', () => {
      expect(parseMoney({ amount: 42.5, currency: 'sar' })).toEqual({
        amount: 42.5,
        currency: 'SAR',
      });
    });

    it('reads a bare number, with no currency of its own', () => {
      expect(parseMoney(44)).toEqual({ amount: 44, currency: null });
    });

    it('reads a decimal serialised as a string', () => {
      expect(parseMoney('42.50').amount).toBe(42.5);
      expect(parseMoney({ amount: '42.50' }).amount).toBe(42.5);
    });

    it('returns null — never 0 — for absent or unparseable money', () => {
      expect(parseMoney(null).amount).toBeNull();
      expect(parseMoney(undefined).amount).toBeNull();
      expect(parseMoney('').amount).toBeNull();
      expect(parseMoney('free').amount).toBeNull();
      expect(parseMoney({}).amount).toBeNull();
    });

    it('preserves a genuine zero on the base price', () => {
      expect(parseMoney({ amount: 0, currency: 'SAR' }).amount).toBe(0);
    });

    it('folds a zero SALE price to null, which is what Salla means by it', () => {
      expect(parseSalePrice({ amount: 0, currency: 'SAR' }).amount).toBeNull();
      expect(parseSalePrice({ amount: 39.75 }).amount).toBe(39.75);
    });
  });

  describe('scalars', () => {
    it('parses booleans in every spelling Salla uses', () => {
      expect(parseBoolean(true)).toBe(true);
      expect(parseBoolean(1)).toBe(true);
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean(0)).toBe(false);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean(undefined)).toBeNull();
      expect(parseBoolean('maybe')).toBeNull();
    });

    it('rejects a non-integer rather than flooring it', () => {
      expect(parseInteger('120')).toBe(120);
      expect(parseInteger(120)).toBe(120);
      expect(parseInteger(12.5)).toBeNull();
      expect(parseInteger(null)).toBeNull();
    });

    it('treats an empty string as absence, not content', () => {
      expect(parseText('  hello  ')).toBe('hello');
      expect(parseText('   ')).toBeNull();
      expect(parseText(null)).toBeNull();
    });

    it('reads a URL from a string or an object', () => {
      expect(parseUrl('https://cdn/a.jpg')).toBe('https://cdn/a.jpg');
      expect(parseUrl({ url: 'https://cdn/a.jpg' })).toBe('https://cdn/a.jpg');
      expect(parseUrl(null)).toBeNull();
      expect(parseUrl({})).toBeNull();
    });

    it('stringifies ids and rejects non-numeric ones', () => {
      expect(stringifyId(445566778)).toBe('445566778');
      expect(stringifyId('445566778')).toBe('445566778');
      expect(stringifyId('abc')).toBeNull();
      expect(stringifyId(null)).toBeNull();
    });
  });
});
