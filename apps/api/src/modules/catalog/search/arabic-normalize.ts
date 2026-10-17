/**
 * Arabic search normalisation.
 *
 * A reader typing "اكواب" and a catalog storing "أكواب" are looking for the
 * same thing: Arabic orthography lets the same word be written with or without
 * hamza, with or without tashkeel, and with either form of the final yeh. A
 * literal match answers "no results" to a query that is, to a human, correct.
 *
 * THIS FUNCTION IS A MIRROR, NOT THE SOURCE OF TRUTH. The authority is the SQL
 * function `packvio_normalize_ar(text)`, which backs the stored generated column
 * `products.name_ar_normalized` and its trigram index. This TypeScript copy
 * exists only to normalise the *query string* — a handful of characters, once
 * per request — so that both sides of the comparison have been through the same
 * transformation.
 *
 * Normalising the COLUMN in JS instead would mean pulling every row into Node to
 * transform it, which no index can help with. If you change one side, change the
 * other; `arabic-normalize.spec.ts` pins the pairs, and the migration that
 * defines the SQL function carries the same table.
 *
 * The transformations, in order (order matters — tashkeel is stripped first so
 * that a hamza carrying a diacritic still folds):
 *
 *   1. strip tashkeel, superscript alef and tatweel  U+064B–U+065F, U+0670, U+0640
 *   2. alef forms → bare alef                        U+0623 U+0625 U+0622 U+0671 → U+0627
 *   3. teh marbuta → heh                             U+0629 → U+0647
 *   4. alef maksura → yeh                            U+0649 → U+064A
 *   5. lowercase (folds Latin embedded in Arabic names, e.g. "PP" → "pp")
 */

const TASHKEEL = /[\u064B-\u065F\u0670\u0640]/g;
const ALEF_FORMS = /[\u0623\u0625\u0622\u0671]/g;
const TEH_MARBUTA = /\u0629/g;
const ALEF_MAKSURA = /\u0649/g;

export function normalizeArabic(input: string): string {
  return input
    .replace(TASHKEEL, '')
    .replace(ALEF_FORMS, '\u0627')
    .replace(TEH_MARBUTA, '\u0647')
    .replace(ALEF_MAKSURA, '\u064A')
    .toLowerCase();
}

/**
 * Prepares a raw user query for the LIKE comparisons.
 *
 * Collapses whitespace and escapes the LIKE metacharacters, so a search for
 * "50%" looks for a literal percent sign instead of matching every row. The
 * escape character is backslash, declared with ESCAPE '\' at the call site.
 */
export function normalizeSearchTerm(input: string): string {
  return escapeLike(normalizeArabic(input.trim().replace(/\s+/g, ' ')));
}

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
