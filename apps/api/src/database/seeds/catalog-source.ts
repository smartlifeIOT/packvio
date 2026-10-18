import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shape of docs/catalog.json — the extraction of the printed company profile,
 * and the seed's only input. Prices and stock are deliberately absent: Salla
 * owns those.
 */
export interface CatalogSourceCategory {
  slug: string;
  slugAr: string;
  nameEn: string;
  nameAr: string;
  order: number;
  descriptionEn?: string;
  descriptionAr?: string;
  /**
   * Whether a buyer's logo can be printed on the products in this category.
   *
   * Declared per CATEGORY rather than per product on purpose: it is one
   * commercial decision about a whole product family ("we do not print on
   * lids"), and 18 reviewable flags is a thing the Packvio team can actually
   * check, where 213 would not be. A product inherits its category's value;
   * absent means `true`, because printing is what the catalog is for.
   */
  customPrinting?: boolean;
  /**
   * Slug of the parent category, when this is a subcategory.
   *
   * Only three families have children — cutlery, clear-cups and wrapping-paper
   * — because only those hold more than one product type. Everywhere else a
   * subcategory would be an empty shelf advertising stock we do not carry.
   *
   * A product is assigned to the CHILD only, never to both: the read side rolls
   * descendants up into the parent, so listing it twice would double-count it.
   */
  parent?: string;
}

/** What differs between the members of a variant family. */
export type CatalogSourceVariantAxis = 'color' | 'size' | 'both';

export interface CatalogSourceProduct {
  code: string;
  category: string;
  nameEn: string;
  nameAr: string;
  size?: string;
  material?: string;
  caseQuantity?: number;
  quoteOnly?: boolean;
  /** Editorial: surfaces this product in the home page's featured rail. */
  featured?: boolean;

  /**
   * Variant family, all DERIVED — written by `node scripts/derive-variants.mjs
   * --write` and not by hand. Re-run that script after editing any product name.
   *
   * The catalogue lists every colour and every size as its own SKU, which is
   * correct for ordering and wrong for browsing: seven Leaf Spoon colours filled
   * seven cards in a grid. These keys let the listing collapse a family to one
   * card while every SKU keeps its own code, slug and product page — none of
   * which may change, because `code` is what the Salla sync joins on and the
   * slugs are public URLs.
   *
   * Absent on the 41 products that have no siblings. A product with no
   * `variantGroup` renders exactly as it did before.
   */
  variantGroup?: string;
  variantAxis?: CatalogSourceVariantAxis;
  /** What distinguishes THIS member, e.g. "Pearl" or "12 OZ Kraft". */
  variantLabelEn?: string;
  variantLabelAr?: string;
  /** The family's shared name, with the distinguishing part removed. */
  variantGroupNameEn?: string;
  variantGroupNameAr?: string;
  /**
   * Hex swatch for the colour in this member's label, where one could be read
   * with confidence. Absent is normal and the UI falls back to the text label —
   * a wrong swatch means a buyer orders the wrong colour, so it never guesses.
   */
  variantSwatch?: string;
}

export interface CatalogSource {
  categories: CatalogSourceCategory[];
  products: CatalogSourceProduct[];
}

/** docs/ sits at the repo root, five levels above this file. */
export const CATALOG_JSON_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'catalog.json',
);

export function loadCatalogSource(path: string = CATALOG_JSON_PATH): CatalogSource {
  // The file is checked into the repo and its shape is asserted below, so a
  // single cast here beats threading `unknown` through every field access.
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CatalogSource>;

  if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.products)) {
    throw new Error(
      `${path} is not a catalog file: expected "categories" and "products" arrays.`,
    );
  }

  return { categories: parsed.categories, products: parsed.products };
}
