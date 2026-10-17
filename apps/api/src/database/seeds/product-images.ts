import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { In, type EntityManager } from 'typeorm';
import { ProductImage } from '../../modules/catalog/entities/product-image.entity';
import type { Product } from '../../modules/catalog/entities/product.entity';
import { SEEDED_IMAGE_PREFIX } from './seeded-image';

/**
 * Seeds the gallery from docs/product-images.json — the photography extracted
 * from Packvio's printed catalogue cards.
 *
 * The source files were a Drive export whose filenames were UUIDs, so nothing
 * in the filename says which product a picture belongs to. Every card was read
 * instead and matched on the CODE printed in its spec table, which is the same
 * string `products.code` holds, so the mapping is the catalogue's own.
 *
 * Two variants per card:
 *   card  the whole catalogue card, trimmed of its page margin and squared on
 *         the card's own tint. Always present. Carries the title, the dimension
 *         diagram and the spec table.
 *   shot  an AUTOMATED crop of just the product photograph. Not reviewed by a
 *         human — a handful clip a title band or a table edge.
 *
 * `card` is primary because it is reliable; `shot` reads better in a grid. When
 * the crops have had a human pass, flip PRIMARY_VARIANT and re-seed.
 */
export const PRIMARY_VARIANT: 'card' | 'shot' = 'card';

export { SEEDED_IMAGE_PREFIX } from './seeded-image';

export interface ProductImageSourceEntry {
  card: string;
  shot: string | null;
  background: string;
  codesOnCard: string[];
}

export interface ProductImageRepresentative {
  /** Key into `images` — a SIBLING product's card. */
  image: string;
  kind: 'duplicate' | 'size-variant' | 'variant';
  note: string;
}

export interface ProductImageSource {
  primaryVariant?: 'card' | 'shot';
  images: Record<string, ProductImageSourceEntry>;
  /** Product code -> image keys, most specific card first. */
  products: Record<string, string[]>;
  /**
   * Product code -> a SIBLING's photograph, for variants the printed catalogue
   * never shot on their own.
   *
   * The 12 oz kraft shaker has no card; the 16 oz does, and it is the same
   * product in a different size. Showing it beats showing a placeholder — but
   * only because the spec table beside it states the real size, and because the
   * alt text says the picture is of the family rather than of that exact SKU.
   *
   * `kind: 'duplicate'` is the one case where no caveat is needed: the
   * catalogue lists the same physical object under two codes.
   *
   * Deliberately a separate map rather than more entries in `products`: these
   * are a compromise, and a compromise that is indistinguishable from the real
   * thing in the data is one nobody will ever go back and fix.
   */
  representative?: Record<string, ProductImageRepresentative>;
}

export const PRODUCT_IMAGES_JSON_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'product-images.json',
);

export function loadProductImageSource(
  path: string = PRODUCT_IMAGES_JSON_PATH,
): ProductImageSource | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // Optional input: a checkout without the photography still seeds a catalog.
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<ProductImageSource>;
  if (!parsed.images || !parsed.products) {
    throw new Error(`${path} is not an image manifest: expected "images" and "products".`);
  }
  return {
    primaryVariant: parsed.primaryVariant,
    images: parsed.images,
    products: parsed.products,
    representative: parsed.representative,
  };
}

interface PlannedImage {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  altEn: string;
  altAr: string;
}

/** Suffixed to alt text when the picture is a sibling's, not this SKU's. */
const REPRESENTATIVE_ALT_EN = 'product family shown';
const REPRESENTATIVE_ALT_AR = 'صورة توضيحية لمجموعة المنتج';

/**
 * Builds the gallery for one product.
 *
 * Order matters and is deliberate: the primary variant of the most specific
 * card first (a card showing this product alone beats one showing six), then
 * its sibling variant, then the remaining cards. Alt text names the product and
 * its code, because a buyer using a screen reader navigates this catalogue by
 * code exactly as a sighted one does.
 */
export function planImagesForProduct(
  source: ProductImageSource,
  code: string,
  nameEn: string,
  nameAr: string,
): PlannedImage[] {
  const own = source.products[code] ?? [];
  const stand = own.length === 0 ? source.representative?.[code] : undefined;
  const keys = own.length > 0 ? own : stand ? [stand.image] : [];

  // A duplicate is the same object under another code, so it needs no caveat.
  // A size or colour variant does.
  const caveat = stand !== undefined && stand.kind !== 'duplicate';

  const primaryVariant = source.primaryVariant ?? PRIMARY_VARIANT;
  const secondaryVariant = primaryVariant === 'card' ? 'shot' : 'card';

  const planned: PlannedImage[] = [];
  for (const key of keys) {
    const entry = source.images[key];
    if (!entry) continue;
    for (const variant of [primaryVariant, secondaryVariant] as const) {
      const url = entry[variant];
      if (!url) continue;
      if (planned.some((image) => image.url === url)) continue;
      planned.push({
        url,
        sortOrder: planned.length,
        isPrimary: planned.length === 0,
        altEn: caveat
          ? `${nameEn} — ${code} (${REPRESENTATIVE_ALT_EN})`
          : `${nameEn} — ${code}`,
        altAr: caveat
          ? `${nameAr} — ${code} (${REPRESENTATIVE_ALT_AR})`
          : `${nameAr} — ${code}`,
      });
    }
  }
  return planned;
}

export interface ImageSeedCounts {
  created: number;
  updated: number;
  removed: number;
  productsWithImages: number;
  /** Of those, how many are showing a sibling's photograph. */
  productsWithRepresentative: number;
}

/**
 * Upserts seeded gallery rows, keyed on (productId, url).
 *
 * Only ever touches rows under SEEDED_IMAGE_PREFIX with a null sallaId: a photo
 * that came from Salla is Salla's to manage, and a re-seed must not disturb it.
 */
export async function syncSeededProductImages(
  manager: EntityManager,
  source: ProductImageSource,
  productRows: Map<string, Product>,
  nameByCode: Map<string, { en: string; ar: string }>,
): Promise<ImageSeedCounts> {
  const repository = manager.getRepository(ProductImage);
  const counts: ImageSeedCounts = {
    created: 0,
    updated: 0,
    removed: 0,
    productsWithImages: 0,
    productsWithRepresentative: 0,
  };

  for (const [code, product] of productRows) {
    const names = nameByCode.get(code);
    const planned = planImagesForProduct(
      source,
      code,
      names?.en ?? code,
      names?.ar ?? code,
    );
    if (planned.length > 0) {
      counts.productsWithImages += 1;
      if (!source.products[code] && source.representative?.[code]) {
        counts.productsWithRepresentative += 1;
      }
    }

    const existing = await repository.find({ where: { productId: product.id } });
    const seeded = existing.filter(
      (image) => image.sallaId === null && image.url.startsWith(SEEDED_IMAGE_PREFIX),
    );
    const bySeededUrl = new Map(seeded.map((image) => [image.url, image]));

    // A product that already carries Salla photography keeps it as primary; the
    // seeded pictures fall in behind rather than fighting over the flag.
    const hasSallaImages = existing.some((image) => image.sallaId !== null);
    const offset = hasSallaImages
      ? Math.max(0, ...existing.filter((i) => i.sallaId !== null).map((i) => i.sortOrder + 1))
      : 0;

    for (const image of planned) {
      const row = bySeededUrl.get(image.url);
      const sortOrder = image.sortOrder + offset;
      const isPrimary = image.isPrimary && !hasSallaImages;
      if (!row) {
        await repository.save(
          repository.create({
            productId: product.id,
            sallaId: null,
            url: image.url,
            altEn: image.altEn,
            altAr: image.altAr,
            sortOrder,
            isPrimary,
          }),
        );
        counts.created += 1;
        continue;
      }
      if (
        row.sortOrder !== sortOrder ||
        row.isPrimary !== isPrimary ||
        row.altEn !== image.altEn ||
        row.altAr !== image.altAr
      ) {
        await repository.update(
          { id: row.id },
          { sortOrder, isPrimary, altEn: image.altEn, altAr: image.altAr },
        );
        counts.updated += 1;
      }
      bySeededUrl.delete(image.url);
    }

    // Seeded rows the manifest no longer lists — the picture was reassigned or
    // withdrawn. Salla-sourced rows are never in this set.
    const stale = [...bySeededUrl.values()].map((image) => image.id);
    if (stale.length > 0) {
      await repository.delete({ id: In(stale) });
      counts.removed += stale.length;
    }
  }

  return counts;
}
