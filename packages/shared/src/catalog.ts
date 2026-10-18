import type { Locale } from './locale';

/**
 * Response contract for the public catalog API (`/api/v1/catalog/*`).
 *
 * THE LOCALE CONTRACT, stated once and true everywhere:
 *
 *   Every endpoint takes `?locale=ar|en` (default `ar`) and returns FLATTENED
 *   localized fields — `name`, `slug`, `description` — already resolved to the
 *   requested locale. The web app never picks a language field, never sees
 *   `nameAr`/`nameEn`, and never has to know which column a string came from.
 *
 *   Non-localized data (code, size, material, caseQuantity, price, currency)
 *   is returned as-is, because it reads the same in both directions.
 *
 *   Every localized entity also carries `alternateSlug`: the same row's slug in
 *   the OTHER locale. The language switcher on a product page needs it to send
 *   the reader to the same product rather than to the home page — which is the
 *   single most common bilingual-site failure, so it is part of the contract
 *   rather than something each consumer has to fetch for itself.
 */

/** Which locale a response was rendered in, and what the other one is. */
export interface LocalizedEntity {
  /** Localized URL segment for the requested locale. */
  slug: string;
  /** The same row's slug in the other locale. Never null — both always exist. */
  alternateSlug: string;
  /** Locale this payload was rendered in. */
  locale: Locale;
}

export interface CatalogImageDto {
  id: string;
  url: string;
  /** Localized alt text; null when none has been authored. */
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CatalogCategoryDto extends LocalizedEntity {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  iconKey: string | null;
  parentId: string | null;
  sortOrder: number;
  /** Active, non-deleted products linked to this category. */
  productCount: number;
  /** Present only on `?tree=true` responses. */
  children?: CatalogCategoryDto[];
}

/**
 * A category plus what a category page needs: its immediate children, and the
 * slug the requested locale should canonically use.
 */
export interface CatalogCategoryDetailDto extends CatalogCategoryDto {
  /**
   * The slug this category should be served under for the requested locale.
   * A lookup resolves against BOTH locales' slug columns, so a reader arriving
   * on `/en/categories/اكواب-قهوة-ورقية` still gets the category — with
   * `canonicalSlug` set to `coffee-cups` so Next can 301 to the right URL
   * instead of 404ing.
   */
  canonicalSlug: string;
  /** True when the requested slug was the other locale's — i.e. redirect. */
  slugMatchedOtherLocale: boolean;
  /**
   * The chain from the root down to this category, EXCLUDING it — so a
   * top-level category has an empty array and "Spoons" has `[Cutlery]`.
   *
   * Breadcrumbs are the reason it exists. Without it a subcategory page can
   * only render "Home > Products > Spoons", which loses the one piece of
   * orientation a nested page owes the reader: what it is nested inside.
   */
  ancestors: CatalogCategoryRefDto[];
  children: CatalogCategoryDto[];
}

/** Which conversion path a product offers. Mirrors the DB enum. */
export type CatalogFulfilmentMode = 'cart' | 'quote' | 'both';

/** What differs between the members of a variant family. */
export type CatalogVariantAxis = 'color' | 'size' | 'both';

/**
 * One member of a variant family, as carried on a sibling's payload.
 *
 * Deliberately tiny. A listing collapses a family to a single card, and the
 * card needs just enough to show the choices and link to each — not a second
 * full product summary per colour, which on the Food Tray family would be
 * twelve nested summaries on one tile.
 */
export interface CatalogVariantRefDto extends LocalizedEntity {
  id: string;
  /** SKU. Latin — bidi-isolate it inside Arabic copy. */
  code: string;
  /** What distinguishes this member, e.g. "Pearl" or "12 OZ Kraft". */
  label: string;
  /**
   * Hex colour for a swatch, or null when none could be read from the label
   * with confidence. Null is common and expected: the UI must fall back to
   * the text label rather than rendering an empty or guessed chip.
   */
  swatch: string | null;
  /** True for the member whose page or card this payload belongs to. */
  isCurrent: boolean;
}

/**
 * The variant family a product belongs to, or null when it has no siblings.
 *
 * Present on every product summary and detail payload. The LISTING endpoints
 * return one row per family — the representative — and `variants` carries the
 * whole family so the card can show swatches and a count. The DETAIL endpoint
 * returns the SKU that was asked for, with the same array, so the product page
 * can offer the other colours.
 *
 * Every member keeps its own slug and its own page: `code` is the key the Salla
 * sync joins on and the slugs are public URLs, so grouping is a presentation
 * layer over unchanged rows, never a merge of them.
 */
export interface CatalogVariantGroupDto {
  /** Stable family key, e.g. "spoons-leaf-spoon-11-5-cm". */
  key: string;
  axis: CatalogVariantAxis;
  /** The family's shared name, localized — "Leaf Spoon 11.5 cm". */
  name: string;
  /** Every member, including the current one. Sorted by sortOrder then code. */
  variants: CatalogVariantRefDto[];
  /** `variants.length`, so a card does not have to count to render "7 colours". */
  count: number;
}

export type CatalogProductStatus = 'active' | 'hidden' | 'out_of_stock';

/** The card shape: everything a grid tile or a rail needs, and nothing else. */
export interface CatalogProductSummaryDto extends LocalizedEntity {
  id: string;
  /** SKU, e.g. "PCS/08". Latin — bidi-isolate it inside Arabic copy. */
  code: string;
  name: string;
  shortDescription: string | null;
  /** Free text, e.g. "8 OZ". Latin — bidi-isolate inside Arabic copy. */
  size: string | null;
  material: string | null;
  /** Units per case. The B2B ordering unit. */
  caseQuantity: number | null;
  price: number | null;
  salePrice: number | null;
  currency: string;
  status: CatalogProductStatus;
  fulfilmentMode: CatalogFulfilmentMode;
  isFeatured: boolean;
  /**
   * Whether a buyer's logo can be printed on this product. Drives the "custom
   * printing available" filter and the badge on the product page. Defaults to
   * true in the database — printing is the catalog's purpose, so the exceptions
   * (lids, cutlery, equipment) are what get enumerated.
   */
  supportsCustomPrinting: boolean;
  /**
   * The product's primary category — the active one with the lowest sortOrder.
   *
   * Null only when a product is linked to no active category, which the seed
   * makes impossible but the schema permits. It is on the SUMMARY, not just the
   * detail payload, because a card has to be able to say what KIND of thing it
   * is showing: with no product photography, the category icon is the only
   * visual distinction between two tiles, and resolving it needs the slug.
   */
  primaryCategory: CatalogCategoryRefDto | null;
  primaryImage: CatalogImageDto | null;
  /**
   * The variant family this product belongs to, or null when it has no
   * siblings (41 of 213).
   *
   * On a LISTING this row is the family's representative and `variantGroup`
   * describes the whole family. `name` above stays the full SKU name
   * ("Leaf Spoon 11.5 cm Pearl"); a card that is standing in for a family
   * should render `variantGroup.name` instead, which is the family name with
   * the distinguishing part removed.
   */
  variantGroup: CatalogVariantGroupDto | null;
}

export interface CatalogPriceTierDto {
  id: string;
  minQuantity: number;
  unitPrice: number;
  /** Localized note, e.g. "includes single-colour print". */
  note: string | null;
}

export interface CatalogProductOptionValueDto {
  id: string;
  /** Localized option value, e.g. "أبيض" / "White". */
  value: string;
  priceDelta: number;
  sortOrder: number;
}

export interface CatalogProductOptionDto {
  id: string;
  name: string;
  type: string | null;
  sortOrder: number;
  values: CatalogProductOptionValueDto[];
}

/** Everything a product page renders, in one payload. */
export interface CatalogProductDetailDto extends CatalogProductSummaryDto {
  description: string | null;
  /** See CatalogCategoryDetailDto.canonicalSlug — same redirect contract. */
  canonicalSlug: string;
  slugMatchedOtherLocale: boolean;
  stockQuantity: number | null;
  isStockUnlimited: boolean;
  /** Salla storefront URL, for the cart handoff. Null until Salla sync runs. */
  sallaUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  images: CatalogImageDto[];
  options: CatalogProductOptionDto[];
  /** Sorted by minQuantity ascending. */
  priceTiers: CatalogPriceTierDto[];
  categories: CatalogCategoryRefDto[];
  /** Up to 8 siblings, preferring the same size or material. Never itself. */
  related: CatalogProductSummaryDto[];
}

/** Minimal category reference embedded in a product payload. */
export interface CatalogCategoryRefDto extends LocalizedEntity {
  id: string;
  name: string;
}

/** Header autocomplete row. Deliberately tiny — this endpoint is typed into. */
export interface CatalogSuggestionDto extends LocalizedEntity {
  id: string;
  name: string;
  code: string;
  categoryName: string | null;
  primaryImage: string | null;
}

/** Everything the home page needs, so Next makes exactly one request. */
export interface CatalogHomeDto {
  locale: Locale;
  /** Top 8 by sortOrder, with counts and images for the category tiles. */
  categories: CatalogCategoryDto[];
  /** Up to 12 products flagged `isFeatured`. Empty if none are flagged. */
  featured: CatalogProductSummaryDto[];
  /** 8 most recently created. */
  newest: CatalogProductSummaryDto[];
  stats: CatalogStatsDto;
}

export interface CatalogStatsDto {
  productCount: number;
  categoryCount: number;
}

/** Envelope for every paginated list endpoint. */
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/** Sort orders accepted by the product list endpoint. */
export type CatalogProductSort = 'featured' | 'name' | 'newest' | 'price_asc' | 'price_desc';

/** The error body every 4xx/5xx from the catalog API returns. */
export interface CatalogErrorDto {
  statusCode: number;
  message: string;
  error: string;
}
