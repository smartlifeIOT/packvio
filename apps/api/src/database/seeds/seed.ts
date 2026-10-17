import { DataSource, In, type EntityManager } from 'typeorm';
import { Category } from '../../modules/catalog/entities/category.entity';
import { ProductCategory } from '../../modules/catalog/entities/product-category.entity';
import {
  FulfilmentMode,
  Product,
  ProductStatus,
} from '../../modules/catalog/entities/product.entity';
import dataSource from '../data-source';
import {
  CATALOG_JSON_PATH,
  loadCatalogSource,
  type CatalogSourceCategory,
  type CatalogSourceProduct,
} from './catalog-source';
import {
  PRODUCT_IMAGES_JSON_PATH,
  loadProductImageSource,
  syncSeededProductImages,
} from './product-images';
import { slugSuffixFromCode, slugifyAr, slugifyEn } from './slugify';

/**
 * Seeds the catalog taxonomy and SKUs from docs/catalog.json.
 *
 * Idempotent: categories upsert on slugEn, products on code. Re-running only
 * refreshes the columns the printed catalog owns. It never writes price,
 * stockQuantity, sallaId or sallaUrl — those stay NULL for Salla to fill — and
 * never touches editorial columns (meta*, descriptions) after the first insert,
 * so a re-seed cannot clobber copy written in the admin. The one exception is
 * `isFeatured`, which catalog.json owns outright — see below.
 */

interface Skipped {
  what: string;
  reason: string;
}

interface Counts {
  created: number;
  updated: number;
}

const summary = {
  categories: { created: 0, updated: 0 } as Counts,
  products: { created: 0, updated: 0 } as Counts,
  links: { created: 0, updated: 0 } as Counts,
  images: { created: 0, updated: 0 } as Counts,
  imagesRemoved: 0,
  productsWithImages: 0,
  productsWithRepresentative: 0,
  skipped: [] as Skipped[],
  coerced: [] as Skipped[],
};

/** Empty-ish source values all mean "unknown", and unknown is NULL in the DB. */
function nullIfBlank(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function seedCategories(source: CatalogSourceCategory[]): CatalogSourceCategory[] {
  const seenSlugEn = new Set<string>();
  const seenSlugAr = new Set<string>();
  const valid: CatalogSourceCategory[] = [];

  for (const category of source) {
    const slugEn = nullIfBlank(category.slug);
    const slugAr = nullIfBlank(category.slugAr);
    const nameEn = nullIfBlank(category.nameEn);
    const nameAr = nullIfBlank(category.nameAr);
    const label = category.slug ?? category.nameEn ?? '(unnamed category)';

    if (!slugEn || !slugAr || !nameEn || !nameAr) {
      summary.skipped.push({
        what: `category ${label}`,
        reason: 'missing slug, slugAr, nameEn or nameAr',
      });
      continue;
    }
    if (seenSlugEn.has(slugEn) || seenSlugAr.has(slugAr)) {
      summary.skipped.push({ what: `category ${label}`, reason: 'duplicate slug in catalog.json' });
      continue;
    }

    seenSlugEn.add(slugEn);
    seenSlugAr.add(slugAr);
    valid.push({ ...category, slug: slugEn, slugAr, nameEn, nameAr });
  }

  return valid;
}

function validateProducts(
  source: CatalogSourceProduct[],
  categorySlugs: Set<string>,
): CatalogSourceProduct[] {
  const seenCodes = new Set<string>();
  const valid: CatalogSourceProduct[] = [];

  for (const product of source) {
    const code = nullIfBlank(product.code);
    const nameEn = nullIfBlank(product.nameEn);
    const nameAr = nullIfBlank(product.nameAr);
    const label = product.code ?? product.nameEn ?? '(unnamed product)';

    if (!code || !nameEn || !nameAr) {
      summary.skipped.push({ what: `product ${label}`, reason: 'missing code, nameEn or nameAr' });
      continue;
    }
    if (seenCodes.has(code)) {
      summary.skipped.push({ what: `product ${label}`, reason: 'duplicate code in catalog.json' });
      continue;
    }
    if (!categorySlugs.has(product.category)) {
      summary.skipped.push({
        what: `product ${label}`,
        reason: `unknown category "${product.category}"`,
      });
      continue;
    }
    if (!slugifyEn(nameEn) || !slugifyAr(nameAr)) {
      summary.skipped.push({ what: `product ${label}`, reason: 'name yields an empty slug' });
      continue;
    }

    seenCodes.add(code);
    valid.push({ ...product, code, nameEn, nameAr });
  }

  return valid;
}

/**
 * Precomputes the slug pair for every product.
 *
 * Collision rule: when a slug base is claimed by more than one product, EVERY
 * claimant gets the code suffix — not just the runners-up. Letting whichever
 * product happened to come first in the JSON keep the bare slug would make the
 * URL depend on file ordering, which is exactly the kind of thing that silently
 * changes under a later re-extraction.
 */
function planSlugs(products: CatalogSourceProduct[]): Map<string, { en: string; ar: string }> {
  const enBaseCount = new Map<string, number>();
  const arBaseCount = new Map<string, number>();

  for (const product of products) {
    const en = slugifyEn(product.nameEn);
    const ar = slugifyAr(product.nameAr);
    enBaseCount.set(en, (enBaseCount.get(en) ?? 0) + 1);
    arBaseCount.set(ar, (arBaseCount.get(ar) ?? 0) + 1);
  }

  const plan = new Map<string, { en: string; ar: string }>();
  for (const product of products) {
    const suffix = slugSuffixFromCode(product.code);
    const enBase = slugifyEn(product.nameEn);
    const arBase = slugifyAr(product.nameAr);
    const en = (enBaseCount.get(enBase) ?? 0) > 1 ? `${enBase}-${suffix}` : enBase;
    const ar = (arBaseCount.get(arBase) ?? 0) > 1 ? `${arBase}-${suffix}` : arBase;

    if (en !== enBase || ar !== arBase) {
      summary.coerced.push({
        what: `product ${product.code}`,
        reason: `slug collision on "${en !== enBase ? enBase : arBase}" — code suffix appended`,
      });
    }
    plan.set(product.code, { en, ar });
  }

  return plan;
}

async function upsertCategories(
  manager: EntityManager,
  source: CatalogSourceCategory[],
): Promise<Map<string, Category>> {
  const repository = manager.getRepository(Category);
  const existing = await repository.find({
    where: { slugEn: In(source.map((category) => category.slug)) },
  });
  const bySlug = new Map(existing.map((category) => [category.slugEn, category]));
  const result = new Map<string, Category>();

  for (const item of source) {
    const found = bySlug.get(item.slug);
    const category = found ?? repository.create({ slugEn: item.slug, slugAr: item.slugAr });

    // Mirrored-from-the-catalog columns: refreshed on every run.
    category.nameEn = item.nameEn;
    category.nameAr = item.nameAr;
    category.sortOrder = Number.isFinite(item.order) ? item.order : 0;

    if (!found) {
      // Editorial columns: seeded once, then owned by whoever edits them.
      category.descriptionEn = nullIfBlank(item.descriptionEn);
      category.descriptionAr = nullIfBlank(item.descriptionAr);
      category.isActive = true;
    }

    result.set(item.slug, await repository.save(category));
    if (found) summary.categories.updated += 1;
    else summary.categories.created += 1;
  }

  /**
   * Parents in a SECOND pass, once every row has an id.
   *
   * A child can appear before its parent in catalog.json — the file is ordered
   * for humans, not for insertion — so resolving `parent` inline would depend
   * on file order and fail silently for whichever child came first. Two passes
   * makes the order irrelevant.
   *
   * `parentId` is re-synced on every run rather than seeded once: the tree is
   * catalog structure, not editorial copy, and moving a subcategory in
   * catalog.json has to actually move it.
   */
  for (const item of source) {
    const category = result.get(item.slug);
    if (!category) continue;

    const parentSlug = nullIfBlank(item.parent);
    const parent = parentSlug ? result.get(parentSlug) : null;

    if (parentSlug && !parent) {
      summary.skipped.push({
        what: `category ${item.slug}`,
        reason: `unknown parent "${parentSlug}" — left at the top level`,
      });
    }

    const parentId = parent?.id ?? null;
    if (category.parentId === parentId) continue;

    category.parentId = parentId;
    await repository.save(category);
  }

  return result;
}

async function upsertProducts(
  manager: EntityManager,
  source: CatalogSourceProduct[],
  slugPlan: Map<string, { en: string; ar: string }>,
  /** category slug → whether that family can carry a printed logo. */
  printableByCategory: Map<string, boolean>,
): Promise<Map<string, Product>> {
  const repository = manager.getRepository(Product);
  const existing = await repository.find({
    where: { code: In(source.map((product) => product.code)) },
    withDeleted: true,
  });
  const byCode = new Map(existing.map((product) => [product.code, product]));
  const result = new Map<string, Product>();

  // Slugs already spoken for by a product this seed is not touching.
  const takenEn = new Set<string>();
  const takenAr = new Set<string>();
  for (const product of await repository.find({ withDeleted: true, select: ['code', 'slugEn', 'slugAr'] })) {
    if (byCode.has(product.code)) continue;
    takenEn.add(product.slugEn);
    takenAr.add(product.slugAr);
  }

  for (const [index, item] of source.entries()) {
    const found = byCode.get(item.code);
    const product = found ?? repository.create({ code: item.code });
    const planned = slugPlan.get(item.code);

    if (!planned) {
      summary.skipped.push({ what: `product ${item.code}`, reason: 'no slug could be planned' });
      continue;
    }

    if (!found) {
      // Slugs are assigned once and then frozen: they are the public URL, and a
      // reworded name in a later catalog extraction must not 404 the old link.
      let { en, ar } = planned;
      if (takenEn.has(en) || takenAr.has(ar)) {
        const suffix = slugSuffixFromCode(item.code);
        en = takenEn.has(en) ? `${en}-${suffix}` : en;
        ar = takenAr.has(ar) ? `${ar}-${suffix}` : ar;
        summary.coerced.push({
          what: `product ${item.code}`,
          reason: 'slug already held by another product in the database — code suffix appended',
        });
      }
      if (takenEn.has(en) || takenAr.has(ar)) {
        summary.skipped.push({
          what: `product ${item.code}`,
          reason: 'slug still collides after adding the code suffix',
        });
        continue;
      }
      product.slugEn = en;
      product.slugAr = ar;
      takenEn.add(en);
      takenAr.add(ar);

      // Local-only defaults, seeded once and never re-imposed.
      product.status = ProductStatus.Active;
      product.currency = 'SAR';
      product.isStockUnlimited = false;
    }

    // Columns the printed catalog owns: refreshed on every run.
    product.nameEn = item.nameEn;
    product.nameAr = item.nameAr;
    product.size = nullIfBlank(item.size);
    product.material = nullIfBlank(item.material);
    product.caseQuantity = coerceCaseQuantity(item);
    product.fulfilmentMode = item.quoteOnly === true ? FulfilmentMode.Quote : FulfilmentMode.Both;
    product.sortOrder = index;
    /**
     * `featured` re-syncs on every run, unlike the other editorial columns.
     * catalog.json is now the source of truth for which twelve products lead the
     * home page, so the flag has to survive a re-seed — and un-flagging one has
     * to be as easy as flagging it, which means the absent case must write
     * `false` rather than being left alone.
     */
    product.isFeatured = item.featured === true;

    /**
     * Inherited from the category, and re-synced on every run for the same
     * reason `featured` is: it is a catalog-level commercial fact, not copy
     * someone wrote in the admin. Absent means printable — see
     * CatalogSourceCategory.customPrinting.
     */
    product.supportsCustomPrinting = printableByCategory.get(item.category) ?? true;

    // A code that reappears in the catalog is back in the range: undo the soft
    // delete rather than inserting a second row that would break uq_products_code.
    if (product.deletedAt !== null && product.deletedAt !== undefined) {
      product.deletedAt = null;
      summary.coerced.push({
        what: `product ${item.code}`,
        reason: 'row was soft-deleted and is present in catalog.json again — restored',
      });
    }

    // price, salePrice, stockQuantity, sallaId, sallaUrl: deliberately untouched.

    result.set(item.code, await repository.save(product));
    if (found) summary.products.updated += 1;
    else summary.products.created += 1;
  }

  return result;
}

function coerceCaseQuantity(item: CatalogSourceProduct): number | null {
  const value = item.caseQuantity;
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    summary.coerced.push({
      what: `product ${item.code}`,
      reason: `caseQuantity ${String(value)} is not a positive integer — stored as NULL`,
    });
    return null;
  }
  return value;
}

async function syncProductCategoryLinks(
  manager: EntityManager,
  source: CatalogSourceProduct[],
  categories: Map<string, Category>,
  products: Map<string, Product>,
): Promise<void> {
  const repository = manager.getRepository(ProductCategory);
  const productIds = [...products.values()].map((product) => product.id);
  const existing = productIds.length
    ? await repository.find({ where: { productId: In(productIds) } })
    : [];
  const byKey = new Map(existing.map((link) => [`${link.productId}:${link.categoryId}`, link]));
  const wanted = new Set<string>();

  // Position within a category follows the order the products appear in the
  // catalog file, which is the order of the printed pages.
  const positions = new Map<string, number>();

  for (const item of source) {
    const product = products.get(item.code);
    const category = categories.get(item.category);
    if (!product || !category) continue;

    const position = positions.get(category.id) ?? 0;
    positions.set(category.id, position + 1);

    const key = `${product.id}:${category.id}`;
    wanted.add(key);
    const found = byKey.get(key);
    const link =
      found ?? repository.create({ productId: product.id, categoryId: category.id });
    link.sortOrder = position;
    await repository.save(link);
    if (found) summary.links.updated += 1;
    else summary.links.created += 1;
  }

  // Drop links the catalog no longer declares, so a re-categorised product does
  // not linger in its old listing.
  const stale = existing.filter((link) => !wanted.has(`${link.productId}:${link.categoryId}`));
  if (stale.length) {
    await repository.remove(stale);
    summary.skipped.push({
      what: `${stale.length} product↔category link(s)`,
      reason: 'no longer present in catalog.json — removed',
    });
  }
}

function printSummary(): void {
  const rows = [
    ['Entity', 'Created', 'Updated'],
    ['categories', String(summary.categories.created), String(summary.categories.updated)],
    ['products', String(summary.products.created), String(summary.products.updated)],
    ['product↔category links', String(summary.links.created), String(summary.links.updated)],
    ['product images', String(summary.images.created), String(summary.images.updated)],
  ];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => [...row[column]].length)),
  );
  const line = (row: string[]): string =>
    row.map((cell, column) => cell.padEnd(widths[column])).join('  ');

  console.log('');
  console.log(line(rows[0]));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows.slice(1)) console.log(line(row));

  console.log('');
  console.log(
    `Photography: ${summary.productsWithImages} products carry a seeded image` +
      (summary.productsWithRepresentative > 0
        ? ` (${summary.productsWithRepresentative} of them a sibling's — see docs/product-images.json § representative)`
        : '') +
      (summary.imagesRemoved > 0 ? `, ${summary.imagesRemoved} stale rows removed` : ''),
  );

  console.log('');
  if (summary.coerced.length === 0) {
    console.log('Coerced: none');
  } else {
    console.log(`Coerced (${summary.coerced.length}):`);
    for (const entry of summary.coerced) console.log(`  - ${entry.what}: ${entry.reason}`);
  }

  if (summary.skipped.length === 0) {
    console.log('Skipped: none');
  } else {
    console.log(`Skipped (${summary.skipped.length}):`);
    for (const entry of summary.skipped) console.log(`  - ${entry.what}: ${entry.reason}`);
  }
  console.log('');
}

async function run(): Promise<void> {
  const source = loadCatalogSource();
  console.log(`Seeding from ${CATALOG_JSON_PATH}`);
  console.log(
    `Source declares ${source.categories.length} categories and ${source.products.length} products.`,
  );

  const categories = seedCategories(source.categories);
  const products = validateProducts(
    source.products,
    new Set(categories.map((category) => category.slug)),
  );
  const slugPlan = planSlugs(products);
  const printableByCategory = new Map(
    categories.map((category) => [category.slug, category.customPrinting !== false]),
  );

  const connection: DataSource = await dataSource.initialize();
  try {
    // One transaction: a half-seeded catalog is worse than no catalog.
    await connection.transaction(async (manager) => {
      const categoryRows = await upsertCategories(manager, categories);
      const productRows = await upsertProducts(manager, products, slugPlan, printableByCategory);
      await syncProductCategoryLinks(manager, products, categoryRows, productRows);

      // Photography is optional input: a checkout without docs/product-images.json
      // still seeds a complete catalog, it just shows placeholders.
      const imageSource = loadProductImageSource();
      if (!imageSource) {
        // Loud, because this fails OPEN: the seed completes, reports success,
        // and every product shows a placeholder. The way it happens in practice
        // is a container image built without docs/product-images.json — see the
        // .dockerignore exception and the COPY in apps/api/Dockerfile.
        console.warn('');
        console.warn('  !! NO IMAGE MANIFEST — every product will show a placeholder.');
        console.warn(`     Looked for: ${PRODUCT_IMAGES_JSON_PATH}`);
        console.warn('     In Docker this means the file was not copied into the image.');
        console.warn('');
      } else {
        const nameByCode = new Map(
          products.map((item) => [item.code, { en: item.nameEn, ar: item.nameAr }]),
        );
        const counts = await syncSeededProductImages(
          manager,
          imageSource,
          productRows,
          nameByCode,
        );
        summary.images.created = counts.created;
        summary.images.updated = counts.updated;
        summary.imagesRemoved = counts.removed;
        summary.productsWithImages = counts.productsWithImages;
        summary.productsWithRepresentative = counts.productsWithRepresentative;
      }
    });
  } finally {
    await connection.destroy();
  }

  printSummary();
}

run().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
