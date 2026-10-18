import { Category } from '../../catalog/entities/category.entity';
import { Product, ProductStatus } from '../../catalog/entities/product.entity';
import { SEEDED_IMAGE_PREFIX } from '../../../database/seeds/seeded-image';
import { slugifyAr, slugifyEn, slugSuffixFromCode } from '../../../database/seeds/slugify';
import {
  parseBoolean,
  parseCategoryIds,
  parseImages,
  parseInteger,
  parseMoney,
  parseSalePrice,
  parseSallaDate,
  parseText,
  parseUrl,
  stringifyId,
  type ParsedImage,
} from './salla-value-parsers';

/**
 * Salla JSON → a partial Product / Category.
 *
 * PURE. Nothing here touches a repository, a clock or a transaction; every
 * function takes what it needs and returns a plain object. That is what makes
 * the ownership rules below testable without a database — and the ownership
 * rules are the entire reason this file exists separately from the writer.
 */

/** Which locale column a sync writes. See `SallaLocale` and the module note. */
export type SallaLocale = 'ar' | 'en';

/**
 * THE ALLOWLIST. The only Product columns a sync may ever write.
 *
 * An allowlist, never a denylist, and the difference is not stylistic: a
 * denylist is correct only until someone adds a column. The next local-only
 * flag — the fourth after `isFeatured`, `supportsCustomPrinting` and
 * `fulfilmentMode` — would be silently writable the moment it was added,
 * discovered later as "Salla keeps resetting our featured products".
 *
 * NOT here, and deliberately: `slugEn`, `slugAr` (public URLs, frozen at
 * insert), `fulfilmentMode`, `isFeatured`, `supportsCustomPrinting`,
 * `sortOrder`, every `meta*` column, and `priceTiers` — all curated locally
 * with no Salla equivalent. Also absent: `code`, which is the join key and is
 * set once at insert; letting a Salla SKU edit rewrite it would sever the row
 * from the seed it matched.
 *
 * Also NOT here: `size`, `material`, `caseQuantity`. The entity's docblock
 * calls them mirrored, but Salla's product payload carries no field that means
 * any of them — they come from the printed catalog. Listing them would create a
 * path for a sync to null out curated spec data the moment someone added a
 * plausible-looking source field.
 */
export const WRITABLE_PRODUCT_COLUMNS = [
  'nameEn',
  'nameAr',
  'shortDescriptionEn',
  'shortDescriptionAr',
  'descriptionEn',
  'descriptionAr',
  'price',
  'salePrice',
  'currency',
  'stockQuantity',
  'isStockUnlimited',
  'status',
  'sallaId',
  'sallaUrl',
  'sallaUpdatedAt',
  'syncedAt',
] as const satisfies ReadonlyArray<keyof Product>;

export type WritableProductColumn = (typeof WRITABLE_PRODUCT_COLUMNS)[number];
export type SallaProductPatch = Partial<Pick<Product, WritableProductColumn>>;

const WRITABLE_PRODUCT_SET: ReadonlySet<string> = new Set(WRITABLE_PRODUCT_COLUMNS);

/** The same rule for categories. Slugs, `iconKey` and `meta*` stay local. */
export const WRITABLE_CATEGORY_COLUMNS = [
  'nameEn',
  'nameAr',
  'descriptionEn',
  'descriptionAr',
  'imageUrl',
  'sortOrder',
  'isActive',
  'sallaId',
  'sallaUpdatedAt',
  'syncedAt',
] as const satisfies ReadonlyArray<keyof Category>;

export type WritableCategoryColumn = (typeof WRITABLE_CATEGORY_COLUMNS)[number];
export type SallaCategoryPatch = Partial<Pick<Category, WritableCategoryColumn>>;

const WRITABLE_CATEGORY_SET: ReadonlySet<string> = new Set(WRITABLE_CATEGORY_COLUMNS);

/**
 * Drops any key not on the allowlist, at RUNTIME.
 *
 * The types already prevent a typo'd column at compile time; this catches the
 * other half — a patch assembled from parsed JSON, where TypeScript's guarantee
 * ends at the `as` that produced it. Belt and braces on the one rule whose
 * failure is invisible until an editor's work has been overwritten.
 */
export function pickWritableProductColumns(patch: Record<string, unknown>): SallaProductPatch {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (WRITABLE_PRODUCT_SET.has(key)) result[key] = value;
  }
  return result as SallaProductPatch;
}

export function pickWritableCategoryColumns(patch: Record<string, unknown>): SallaCategoryPatch {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (WRITABLE_CATEGORY_SET.has(key)) result[key] = value;
  }
  return result as SallaCategoryPatch;
}

// --- matching -------------------------------------------------------------

export interface ProductMatchKeys {
  /** Salla's SKU, which the seed stores as `products.code`. */
  code: string | null;
  sallaId: string | null;
}

/**
 * How a Salla product finds its local row.
 *
 * SKU FIRST, `sallaId` second, and the order is the whole point. The seed holds
 * all 213 printed-catalog codes with `salla_id = NULL`; Salla holds the same
 * products under its own ids. Matching on `sallaId` alone would find nothing on
 * the first sync and insert 213 duplicates alongside the curated rows — every
 * one of them with a fresh slug, no case quantity and no custom-printing flag.
 *
 * Matching on SKU is what marries the two catalogs. `sallaId` is the fallback
 * for a product whose SKU was later edited in Salla, and for rows we created
 * ourselves from Salla and which therefore have no printed-catalog code.
 */
export function productMatchKeys(payload: Record<string, unknown>): ProductMatchKeys {
  return {
    code: normalizeCode(parseText(payload.sku)),
    sallaId: stringifyId(payload.id),
  };
}

/**
 * Codes are compared case-insensitively but stored as the catalog spells them.
 *
 * Someone typing `pcs/08` into Salla means `PCS/08`; treating those as two
 * products is the same duplicate-catalog failure by a different route.
 */
export function normalizeCode(code: string | null): string | null {
  return code === null ? null : code.trim().toUpperCase();
}

// --- status ---------------------------------------------------------------

/**
 * Salla status → ours.
 *
 * `sale` → active, `out` → out_of_stock, `hidden` → hidden. An UNRECOGNISED
 * status returns null and the caller leaves the column alone: inventing
 * `active` for a status Salla added later could publish something the merchant
 * meant to hide, and defaulting to `hidden` could silently delist the catalog.
 * Not writing is the only safe answer to "I do not know what this means".
 */
export function mapProductStatus(value: unknown): ProductStatus | null {
  const status = parseText(value)?.toLowerCase();
  if (!status) return null;

  switch (status) {
    case 'sale':
    case 'active':
    case 'available':
      return ProductStatus.Active;
    case 'out':
    case 'out_of_stock':
    case 'outofstock':
    case 'sold_out':
      return ProductStatus.OutOfStock;
    case 'hidden':
    case 'inactive':
    case 'draft':
      return ProductStatus.Hidden;
    default:
      return null;
  }
}

/** Salla category status → `isActive`. Unknown values leave the column alone. */
export function mapCategoryActive(value: unknown): boolean | null {
  const status = parseText(value)?.toLowerCase();
  if (!status) return null;
  if (['active', 'sale', 'visible', 'published'].includes(status)) return true;
  if (['hidden', 'inactive', 'draft', 'unpublished'].includes(status)) return false;
  return null;
}

// --- products -------------------------------------------------------------

export interface ProductMappingOptions {
  /**
   * The locale the store's Salla content is written in.
   *
   * BILINGUAL BEHAVIOUR, and the reason it is a single value rather than a pair:
   * Salla admin v2 returns ONE language per request — the store's own — and
   * this app has found no documented, reliable per-locale read to fetch the
   * other. So a sync writes only the column matching this locale and leaves the
   * opposite one untouched. That asymmetry is deliberate: overwriting a curated
   * Arabic product name with the English one Salla happened to return is worse
   * than leaving the Arabic slightly stale, and it is not recoverable without a
   * re-seed.
   *
   * The exception is INSERT, where both name columns are NOT NULL and there is
   * no curated value to protect — see `toProductInsert`.
   */
  locale: SallaLocale;
  /** Stamped into `syncedAt`. Injected so the mapper stays pure. */
  now: Date;
  /** Fallback when a bare-number price carries no currency of its own. */
  defaultCurrency?: string;
}

/**
 * The mirrored half of a product, ready to merge onto an existing row.
 *
 * Everything returned is on the allowlist. Keys are OMITTED rather than set to
 * null when Salla said nothing about them — `undefined` means "no opinion", and
 * that distinction is what stops a lean webhook payload from nulling out fields
 * a fuller one had populated.
 */
export function toProductPatch(
  payload: Record<string, unknown>,
  options: ProductMappingOptions,
): SallaProductPatch {
  const { locale, now } = options;
  const patch: Record<string, unknown> = {};

  const name = parseText(payload.name);
  if (name) patch[locale === 'ar' ? 'nameAr' : 'nameEn'] = name;

  const description = parseText(payload.description);
  if (description) {
    patch[locale === 'ar' ? 'descriptionAr' : 'descriptionEn'] = description;
  }

  const shortDescription = parseText(payload.short_description ?? payload.brief);
  if (shortDescription) {
    patch[locale === 'ar' ? 'shortDescriptionAr' : 'shortDescriptionEn'] = shortDescription;
  }

  /**
   * Price. `null` is written through as a real null — a product Salla stopped
   * pricing must stop showing a price, and leaving the old one would quote a
   * figure the merchant has withdrawn. Only an ABSENT key is left alone.
   */
  if ('price' in payload) {
    const price = parseMoney(payload.price);
    patch.price = price.amount;
    const currency = price.currency ?? parseText(payload.currency)?.toUpperCase();
    if (currency) patch.currency = currency;
  }

  if ('sale_price' in payload) {
    patch.salePrice = parseSalePrice(payload.sale_price).amount;
  }

  if ('quantity' in payload) patch.stockQuantity = parseInteger(payload.quantity);

  const unlimited = parseBoolean(payload.unlimited_quantity);
  if (unlimited !== null) patch.isStockUnlimited = unlimited;

  const status = mapProductStatus(payload.status);
  if (status !== null) patch.status = status;

  const sallaId = stringifyId(payload.id);
  if (sallaId) patch.sallaId = sallaId;

  const url = parseText(asRecord(payload.urls)?.customer);
  if (url) patch.sallaUrl = url;

  const updatedAt = parseSallaDate(payload.updated_at);
  if (updatedAt) patch.sallaUpdatedAt = updatedAt;

  patch.syncedAt = now;

  // Runtime allowlist pass — see pickWritableProductColumns.
  return pickWritableProductColumns(patch);
}

export interface ProductInsert extends SallaProductPatch {
  code: string;
  /** Proposed base slugs. The writer resolves collisions; see `withSlugSuffix`. */
  slugEn: string;
  slugAr: string;
  nameEn: string;
  nameAr: string;
}

/**
 * A product Salla has that we have never seen — the only path that may set
 * `code` and the slug columns.
 *
 * BOTH name columns are filled here even though a sync normally writes one.
 * They are NOT NULL, and on an insert there is no curated value to protect: the
 * choice is the same string in both columns or a failed insert. The opposite
 * locale is therefore seeded with the store-language text and flagged for
 * translation, and every subsequent update leaves it alone — so a human
 * translation, once written, is never overwritten.
 */
export function toProductInsert(
  payload: Record<string, unknown>,
  options: ProductMappingOptions,
): ProductInsert | null {
  const keys = productMatchKeys(payload);
  const name = parseText(payload.name);
  if (!name) return null;

  /**
   * A product with no SKU still needs a `code` — it is NOT NULL and unique.
   * Synthesising `SALLA-<id>` keeps the row insertable and makes its origin
   * obvious to anyone reading the catalog later.
   */
  const code = keys.code ?? (keys.sallaId ? `SALLA-${keys.sallaId}` : null);
  if (!code) return null;

  const patch = toProductPatch(payload, options);

  const slugBaseEn = slugifyEn(name) || slugSuffixFromCode(code);
  const slugBaseAr = slugifyAr(name) || slugSuffixFromCode(code);

  return {
    ...patch,
    code,
    slugEn: slugBaseEn,
    slugAr: slugBaseAr,
    nameEn: patch.nameEn ?? name,
    nameAr: patch.nameAr ?? name,
  };
}

/** `wooden-stirrer` + `ST/178WOOD` → `wooden-stirrer-st-178wood`. */
export function withSlugSuffix(base: string, code: string): string {
  const suffix = slugSuffixFromCode(code);
  return suffix ? `${base}-${suffix}` : base;
}

// --- out-of-order guard ---------------------------------------------------

/**
 * Whether an incoming payload is OLDER than what we already stored.
 *
 * Webhooks arrive out of order — Salla retries, and a retried `product.updated`
 * can land after a newer one that succeeded first. Without this, the retry wins
 * and the catalog silently reverts.
 *
 * A payload with NO timestamp is never treated as stale: refusing it would drop
 * every delivery from an endpoint that omits `updated_at`, which is a much
 * larger failure than occasionally applying an update twice. Equal timestamps
 * are also not stale — a second delivery of the same state is harmless, and
 * treating equality as stale would drop the legitimate first application when
 * two edits share a second.
 */
export function isStalePayload(
  payload: Record<string, unknown>,
  storedUpdatedAt: Date | null | undefined,
): boolean {
  if (!storedUpdatedAt) return false;
  const incoming = parseSallaDate(payload.updated_at);
  if (!incoming) return false;
  return incoming.getTime() < storedUpdatedAt.getTime();
}

// --- images ---------------------------------------------------------------

export interface ImageRow {
  id?: string;
  sallaId: string | null;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ImageReconciliation {
  toInsert: ParsedImage[];
  toUpdate: Array<{ id: string; sortOrder: number; isPrimary: boolean; sallaId: string | null }>;
  toDeleteIds: string[];
}

/**
 * Diffs a stored gallery against an incoming one, BY URL.
 *
 * By URL rather than by Salla image id because the id is not present in every
 * payload shape — `main_image` as a bare string has none — and a null-keyed
 * diff would re-insert the same picture on every sync. The URL is the one
 * identifier all shapes carry.
 *
 * Removed images are DELETED, not soft-deleted: unlike a product, an image has
 * no historical reference pointing at it, and keeping withdrawn photography
 * around would eventually show a product in packaging it no longer ships in.
 */
export function planImageReconciliation(
  existing: ImageRow[],
  incoming: ParsedImage[],
): ImageReconciliation {
  const existingByUrl = new Map(existing.map((image) => [image.url, image]));
  const incomingUrls = new Set(incoming.map((image) => image.url));

  const toInsert: ParsedImage[] = [];
  const toUpdate: ImageReconciliation['toUpdate'] = [];

  for (const image of incoming) {
    const match = existingByUrl.get(image.url);
    if (!match) {
      toInsert.push(image);
      continue;
    }
    if (
      match.sortOrder !== image.sortOrder ||
      match.isPrimary !== image.isPrimary ||
      (image.sallaId !== null && match.sallaId !== image.sallaId)
    ) {
      toUpdate.push({
        id: match.id ?? '',
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
        sallaId: image.sallaId ?? match.sallaId,
      });
    }
  }

  const isSeeded = (image: ImageRow): boolean =>
    image.sallaId === null && image.url.startsWith(SEEDED_IMAGE_PREFIX);

  const toDeleteIds = existing
    .filter((image) => !incomingUrls.has(image.url))
    // Seeded photography is NOT Salla's to delete. The pictures extracted from
    // the printed catalogue live at a relative /products/ path with a null
    // sallaId; Salla has never heard of them, so their absence from its payload
    // is not evidence of anything. Without this filter the first product.updated
    // carrying an `images` key would wipe the gallery of every product whose
    // photography has not been uploaded to Salla yet — which, at the time of
    // writing, is all of them. Same shape of mistake as deleting seed-only
    // products in reconciliation, and guarded the same way.
    .filter((image) => !isSeeded(image))
    .map((image) => image.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');

  // -------------------------------------------------------------------------
  // Salla photography OUTRANKS the seeded catalogue cards, and until this block
  // existed nothing said so.
  //
  // The delete guard above means a product that has both keeps both. But the
  // seed marks its first picture `isPrimary` at `sortOrder` 0, and the Salla
  // parser marks ITS first picture `isPrimary` at `sortOrder` 0 too — so after
  // the first sync PCS/08 held FOUR images, TWO of them flagged primary, with
  // sort orders 0,0,1,1. Whatever renders "the primary image" then picks
  // whichever row the query happened to return first: the product page could
  // show the catalogue card one day and the real photograph the next, and the
  // gallery order was undefined. No test caught it because the only suite that
  // can see it needs Postgres and skips without one.
  //
  // The rule, stated once: a seeded card is a STAND-IN until real photography
  // exists. So when Salla supplies any image, the seeded survivors are demoted
  // and sorted after it — kept, because losing them when a merchant clears
  // their Salla gallery would empty the page, but never shown first.
  //
  // When Salla supplies NO images there is nothing to defer to, and the seeded
  // primary stays exactly as the seed set it.
  // -------------------------------------------------------------------------
  if (incoming.length > 0) {
    const survivingSeeded = existing
      .filter(isSeeded)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    survivingSeeded.forEach((image, index) => {
      const sortOrder = incoming.length + index;
      if (image.isPrimary || image.sortOrder !== sortOrder) {
        toUpdate.push({
          id: image.id ?? '',
          sortOrder,
          isPrimary: false,
          sallaId: image.sallaId,
        });
      }
    });
  }

  return { toInsert, toUpdate, toDeleteIds };
}

/** Re-exported so callers need only import the mapper. */
export { parseImages };

// --- categories -----------------------------------------------------------

export interface CategoryLinkPlan {
  toAdd: string[];
  toRemove: string[];
}

/**
 * Diffs a product's category memberships.
 *
 * A product REMOVED from a category in Salla is removed locally — the join row
 * carries no local data worth preserving, and leaving it would keep the product
 * in a listing the merchant deliberately took it out of.
 *
 * Salla category ids with no local counterpart are simply absent from
 * `resolvedIds` and produce no link, rather than an error: the category webhook
 * may not have arrived yet, and the next reconcile repairs it.
 */
export function planCategoryLinks(
  existingCategoryIds: string[],
  resolvedIds: string[],
): CategoryLinkPlan {
  const existing = new Set(existingCategoryIds);
  const incoming = new Set(resolvedIds);

  return {
    toAdd: [...incoming].filter((id) => !existing.has(id)),
    toRemove: [...existing].filter((id) => !incoming.has(id)),
  };
}

export function toCategoryPatch(
  payload: Record<string, unknown>,
  options: ProductMappingOptions,
): SallaCategoryPatch {
  const { locale, now } = options;
  const patch: Record<string, unknown> = {};

  const name = parseText(payload.name);
  if (name) patch[locale === 'ar' ? 'nameAr' : 'nameEn'] = name;

  const description = parseText(payload.description);
  if (description) patch[locale === 'ar' ? 'descriptionAr' : 'descriptionEn'] = description;

  const image = parseUrl(payload.image);
  if (image) patch.imageUrl = image;

  const sortOrder = parseInteger(payload.sort_order);
  if (sortOrder !== null) patch.sortOrder = sortOrder;

  const active = mapCategoryActive(payload.status);
  if (active !== null) patch.isActive = active;

  const sallaId = stringifyId(payload.id);
  if (sallaId) patch.sallaId = sallaId;

  const updatedAt = parseSallaDate(payload.updated_at);
  if (updatedAt) patch.sallaUpdatedAt = updatedAt;

  patch.syncedAt = now;

  return pickWritableCategoryColumns(patch);
}

export interface CategoryInsert extends SallaCategoryPatch {
  slugEn: string;
  slugAr: string;
  nameEn: string;
  nameAr: string;
}

export function toCategoryInsert(
  payload: Record<string, unknown>,
  options: ProductMappingOptions,
): CategoryInsert | null {
  const name = parseText(payload.name);
  if (!name) return null;

  const patch = toCategoryPatch(payload, options);
  const sallaId = stringifyId(payload.id) ?? 'unknown';

  return {
    ...patch,
    slugEn: slugifyEn(name) || `salla-${sallaId}`,
    slugAr: slugifyAr(name) || `salla-${sallaId}`,
    nameEn: patch.nameEn ?? name,
    nameAr: patch.nameAr ?? name,
  };
}

/** Category ids referenced by a product payload. */
export { parseCategoryIds };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
