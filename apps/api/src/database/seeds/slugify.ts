/**
 * Slug generation for the catalog seed.
 *
 * Two locales, two rules. English slugs are ASCII kebab-case. Arabic slugs keep
 * Arabic script — an Arabic URL segment is percent-encoded on the wire but
 * shows as readable Arabic in the browser bar, which is the point.
 *
 * The character classes below are written as \u escapes on purpose: literal
 * Arabic inside a regex renders bidirectionally in editors and diffs, which
 * makes a range trivially easy to misread and mis-edit.
 */

/** Combining marks left behind by NFKD normalisation of Latin text. */
const LATIN_COMBINING_MARKS = /[\u0300-\u036F]/g;

/** Tashkeel, superscript alef, Quranic marks and tatweel — decoration, never part of a slug. */
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Alef madda/hamza forms fold to bare alef, matching the hand-written slugs in catalog.json. */
const ARABIC_ALEF_FORMS = /[\u0622\u0623\u0625]/g;

/**
 * Everything that is NOT an Arabic letter, a Latin letter or a digit becomes a
 * separator. That deliberately drops the symbols the printed catalog uses inside
 * Arabic names — Ø, ×, ³, ':' — while keeping embedded Latin material codes
 * (PET, PP, OPS) and numbers, which are what make the slug identifiable.
 *
 * U+0621-U+063A = hamza..ghain, U+0641-U+064A = feh..yeh (skipping the
 * diacritic block between them), U+0671-U+06D3 = the extended Arabic letters.
 */
const ARABIC_SLUG_SEPARATORS = /[^\u0621-\u063A\u0641-\u064A\u0671-\u06D3a-zA-Z0-9]+/g;

const TRIM_HYPHENS = /^-+|-+$/g;

/** "Single Wall Coffee Cup 8 oz" → "single-wall-coffee-cup-8-oz" */
export function slugifyEn(input: string): string {
  return input
    .normalize('NFKD')
    .replace(LATIN_COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(TRIM_HYPHENS, '');
}

/** "كوب قهوة جدار مفرد 8 أونصة" → "كوب-قهوة-جدار-مفرد-8-اونصة" */
export function slugifyAr(input: string): string {
  return input
    .normalize('NFKC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(ARABIC_ALEF_FORMS, 'ا')
    .replace(ARABIC_SLUG_SEPARATORS, '-')
    .replace(TRIM_HYPHENS, '')
    .toLowerCase(); // only affects embedded Latin: "PET" → "pet"
}

/**
 * Disambiguating suffix for a slug collision: the product code, lowercased,
 * with "/" turned into "-". "PCS/08" → "pcs-08".
 */
export function slugSuffixFromCode(code: string): string {
  return slugifyEn(code.replace(/\//g, '-'));
}

/** The three fields slug planning needs. Structural, so this file imports nothing. */
export type SluggableProduct = { code: string; nameEn: string; nameAr: string };

export type SlugPlan = {
  plan: Map<string, { en: string; ar: string }>;
  coerced: Array<{ code: string; base: string }>;
};

/**
 * The slug every product in a catalog source WANTS, before the database gets a
 * say. Two products with the same name both get the code suffix, so neither
 * one's slug depends on the order they happen to appear in the file.
 *
 * Lives here rather than in seed.ts because `prune.ts` has to compute the same
 * answer — it decides whether a product's current slug is its planned slug plus
 * a collision suffix, which is only a safe thing to reclaim if "planned" means
 * exactly what the seed meant by it. Two copies of this would be two
 * definitions of a public URL.
 *
 * Pure: it reports coercions rather than recording them anywhere, so the seed
 * can fold them into its summary and the prune can ignore them.
 */
export function planProductSlugs(products: readonly SluggableProduct[]): SlugPlan {
  const enBaseCount = new Map<string, number>();
  const arBaseCount = new Map<string, number>();

  for (const product of products) {
    const en = slugifyEn(product.nameEn);
    const ar = slugifyAr(product.nameAr);
    enBaseCount.set(en, (enBaseCount.get(en) ?? 0) + 1);
    arBaseCount.set(ar, (arBaseCount.get(ar) ?? 0) + 1);
  }

  const plan = new Map<string, { en: string; ar: string }>();
  const coerced: Array<{ code: string; base: string }> = [];

  for (const product of products) {
    const suffix = slugSuffixFromCode(product.code);
    const enBase = slugifyEn(product.nameEn);
    const arBase = slugifyAr(product.nameAr);
    const en = (enBaseCount.get(enBase) ?? 0) > 1 ? `${enBase}-${suffix}` : enBase;
    const ar = (arBaseCount.get(arBase) ?? 0) > 1 ? `${arBase}-${suffix}` : arBase;

    if (en !== enBase || ar !== arBase) {
      coerced.push({ code: product.code, base: en !== enBase ? enBase : arBase });
    }
    plan.set(product.code, { en, ar });
  }

  return { plan, coerced };
}
