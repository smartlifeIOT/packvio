import { escapeLike, normalizeArabic, normalizeSearchTerm } from './arabic-normalize';

/**
 * Pins the normalisation rule.
 *
 * These pairs are the contract between this function and the SQL function
 * `packvio_normalize_ar` that backs `products.name_ar_normalized`. If a change
 * here does not land in the migration too, the query string and the indexed
 * column stop agreeing and Arabic search quietly returns nothing — which is
 * exactly the failure mode this suite exists to make loud.
 */
describe('normalizeArabic', () => {
  it.each([
    // [input, expected, what it covers]
    ['أكواب', 'اكواب', 'alef with hamza above'],
    ['إكواب', 'اكواب', 'alef with hamza below'],
    ['آكواب', 'اكواب', 'alef with madda'],
    ['ٱكواب', 'اكواب', 'alef wasla'],
    ['قهوة', 'قهوه', 'teh marbuta to heh'],
    ['مقلى', 'مقلي', 'alef maksura to yeh'],
    ['كُوْب', 'كوب', 'tashkeel stripped'],
    ['كــوب', 'كوب', 'tatweel stripped'],
    ['PP', 'pp', 'embedded Latin lowercased'],
  ])('normalizes %s (%s)', (input, expected) => {
    expect(normalizeArabic(input)).toBe(expected);
  });

  it('is idempotent — normalizing an already-normalized string changes nothing', () => {
    const once = normalizeArabic('أكواب قهوة');
    expect(normalizeArabic(once)).toBe(once);
  });

  it('collapses the hamza spellings of the same word onto one key', () => {
    // The whole point: a reader typing either spelling must find the product.
    const withHamza = normalizeArabic('أكواب');
    const without = normalizeArabic('اكواب');
    expect(withHamza).toBe(without);
  });

  it('leaves Latin product codes intact apart from case', () => {
    expect(normalizeArabic('PCS/08')).toBe('pcs/08');
    expect(normalizeArabic('SBL/150 OPS')).toBe('sbl/150 ops');
  });
});

describe('normalizeSearchTerm', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeSearchTerm('  كوب   قهوة  ')).toBe(
      'كوب قهوه',
    );
  });

  it('produces the same key for a term with and without a trailing space', () => {
    expect(normalizeSearchTerm('اكواب ')).toBe(
      normalizeSearchTerm('اكواب'),
    );
  });

  it('escapes LIKE wildcards so they are searched for literally', () => {
    // Without this, a search for "%" matches the entire catalog.
    expect(normalizeSearchTerm('50%')).toBe('50\\%');
    expect(normalizeSearchTerm('a_b')).toBe('a\\_b');
    expect(normalizeSearchTerm('back\\slash')).toBe('back\\\\slash');
  });
});

describe('escapeLike', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLike('pcs/08')).toBe('pcs/08');
  });
});
