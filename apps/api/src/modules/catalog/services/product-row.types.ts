import type { CatalogFulfilmentMode, CatalogProductStatus } from '@packvio/shared';

/**
 * Row shapes returned by the hand-written list queries.
 *
 * The list endpoints do not hydrate entities: they run one SELECT with a LATERAL
 * join for the primary image, which is what keeps a 24-item page at a single
 * query instead of 25. That means the rows arrive as plain objects with the
 * database's snake_case column names, so they get typed here rather than being
 * passed around as `any` and indexed by string literal at the call site.
 *
 * `price` and `sale_price` are typed as `string | number` because pg returns
 * `numeric` as a string; CatalogMapperService converts.
 */
export interface ProductSummaryRow {
  id: string;
  code: string;
  slug_ar: string;
  slug_en: string;
  name_ar: string;
  name_en: string;
  short_description_ar: string | null;
  short_description_en: string | null;
  size: string | null;
  material: string | null;
  case_quantity: number | null;
  price: string | number | null;
  sale_price: string | number | null;
  currency: string;
  status: CatalogProductStatus;
  fulfilment_mode: CatalogFulfilmentMode;
  is_featured: boolean;
  supports_custom_printing: boolean;
  category_id: string | null;
  category_name_ar: string | null;
  category_name_en: string | null;
  category_slug_ar: string | null;
  category_slug_en: string | null;
  image_id: string | null;
  image_url: string | null;
  image_alt_ar: string | null;
  image_alt_en: string | null;
  image_is_primary: boolean | null;
  image_sort_order: number | null;
  /** Variant family. NULL on the 41 products with no siblings. */
  variant_group: string | null;
  variant_axis: string | null;
  variant_label_ar: string | null;
  variant_label_en: string | null;
  variant_group_name_ar: string | null;
  variant_group_name_en: string | null;
  variant_swatch: string | null;
}

/**
 * One member of a variant family, loaded in a single follow-up query for every
 * family on the page.
 *
 * Separate from ProductSummaryRow because a card needs only enough to draw a
 * swatch and link to the sibling. Carrying a whole summary per member would put
 * twelve nested product payloads on one Food Tray tile.
 */
export interface VariantMemberRow {
  id: string;
  code: string;
  slug_ar: string;
  slug_en: string;
  variant_group: string;
  variant_label_ar: string | null;
  variant_label_en: string | null;
  variant_swatch: string | null;
}

export interface SuggestionRow {
  id: string;
  code: string;
  slug_ar: string;
  slug_en: string;
  name_ar: string;
  name_en: string;
  category_name_ar: string | null;
  category_name_en: string | null;
  image_url: string | null;
}

export interface CountRow {
  count: string;
}

export interface CategoryCountRow {
  category_id: string;
  product_count: string;
}
