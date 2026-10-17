import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, In, IsNull, Not } from 'typeorm';
import type { AppConfig } from '../../../config/configuration';
import { Category } from '../../catalog/entities/category.entity';
import { ProductCategory } from '../../catalog/entities/product-category.entity';
import { ProductImage } from '../../catalog/entities/product-image.entity';
import { Product } from '../../catalog/entities/product.entity';
import {
  isStalePayload,
  parseCategoryIds,
  parseImages,
  planCategoryLinks,
  planImageReconciliation,
  productMatchKeys,
  toCategoryInsert,
  toCategoryPatch,
  toProductInsert,
  toProductPatch,
  withSlugSuffix,
  type ProductMappingOptions,
  type SallaLocale,
} from './salla-catalog.mapper';
import { stringifyId } from './salla-value-parsers';

/** What happened to one entity, for the SyncRun counters. */
export type WriteOutcome = 'created' | 'updated' | 'skipped' | 'deleted' | 'unchanged';

export interface WriteResult {
  outcome: WriteOutcome;
  /** Cache tags the site must purge because of this write. */
  tags: string[];
  /** Human-readable note for the log and, on a dry run, the diff report. */
  detail: string;
}

const NO_OP: WriteResult = { outcome: 'skipped', tags: [], detail: 'nothing to do' };

/**
 * The DB-facing half of the Salla catalog sync.
 *
 * Every method takes an EntityManager rather than injecting repositories, so
 * the CALLER owns the transaction. That is what lets the event processor wrap
 * one webhook in one transaction and the reconcile job wrap one product in one
 * transaction, without either of them reimplementing the write.
 *
 * All mapping decisions live in SallaCatalogMapper; this file is only
 * responsible for finding rows, resolving collisions and issuing writes.
 */
@Injectable()
export class SallaCatalogWriterService {
  private readonly logger = new Logger(SallaCatalogWriterService.name);
  private readonly storeLocale: SallaLocale;

  constructor(config: ConfigService) {
    this.storeLocale = config.get<AppConfig['salla']>('salla')?.storeLocale ?? 'ar';
  }

  private options(now: Date): ProductMappingOptions {
    return { locale: this.storeLocale, now };
  }

  // --- products ----------------------------------------------------------

  /**
   * Creates or updates one product from a Salla payload.
   *
   * `dryRun` short-circuits every write but performs every lookup, so the
   * reported outcome is what would actually happen — a dry run that guessed
   * would be worse than none.
   */
  async upsertProduct(
    manager: EntityManager,
    payload: Record<string, unknown>,
    options: { now?: Date; dryRun?: boolean } = {},
  ): Promise<WriteResult> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const keys = productMatchKeys(payload);

    if (!keys.code && !keys.sallaId) {
      return { outcome: 'skipped', tags: [], detail: 'payload carried neither SKU nor id' };
    }

    const existing = await this.findProduct(manager, keys.code, keys.sallaId);

    /**
     * OUT-OF-ORDER GUARD. Salla retries, so a stale `product.updated` can land
     * after a newer one already applied. Letting it through silently reverts
     * the catalog to an older state that nobody edited it back to.
     */
    if (existing && isStalePayload(payload, existing.sallaUpdatedAt)) {
      return {
        outcome: 'skipped',
        tags: [],
        detail: `stale payload for ${existing.code} (incoming older than salla_updated_at)`,
      };
    }

    if (existing) return this.updateProduct(manager, existing, payload, now, dryRun);
    return this.createProduct(manager, payload, now, dryRun);
  }

  /**
   * SKU first, `sallaId` second — see the mapper's `productMatchKeys` note.
   *
   * `withDeleted` on purpose: a product Salla deleted and then restored must
   * come back to life on the row that already exists, not arrive as a duplicate
   * that collides on the unique `code`.
   */
  private async findProduct(
    manager: EntityManager,
    code: string | null,
    sallaId: string | null,
  ): Promise<Product | null> {
    const repository = manager.getRepository(Product);

    if (code) {
      const byCode = await repository
        .createQueryBuilder('p')
        .where('upper(p.code) = :code', { code })
        .withDeleted()
        .getOne();
      if (byCode) return byCode;
    }

    if (sallaId) {
      const bySallaId = await repository.findOne({ where: { sallaId }, withDeleted: true });
      if (bySallaId) return bySallaId;
    }

    return null;
  }

  private async updateProduct(
    manager: EntityManager,
    existing: Product,
    payload: Record<string, unknown>,
    now: Date,
    dryRun: boolean,
  ): Promise<WriteResult> {
    const patch = toProductPatch(payload, this.options(now));
    const tags = this.productTags(existing);

    if (dryRun) {
      return {
        outcome: 'updated',
        tags,
        detail: `would update ${existing.code} (${Object.keys(patch).join(', ')})`,
      };
    }

    /**
     * A product Salla is talking about again is a product Salla has. If it was
     * soft-deleted by an earlier `product.deleted` or a reconcile, this restores
     * it rather than leaving a live upstream product invisible on the site.
     */
    const wasDeleted = existing.deletedAt !== null;
    if (wasDeleted) existing.deletedAt = null;

    Object.assign(existing, patch);
    await manager.getRepository(Product).save(existing);

    await this.reconcileImages(manager, existing, payload);
    const categoryTags = await this.reconcileCategoryLinks(manager, existing, payload);

    return {
      outcome: 'updated',
      tags: [...tags, ...categoryTags],
      detail: wasDeleted ? `restored and updated ${existing.code}` : `updated ${existing.code}`,
    };
  }

  private async createProduct(
    manager: EntityManager,
    payload: Record<string, unknown>,
    now: Date,
    dryRun: boolean,
  ): Promise<WriteResult> {
    const insert = toProductInsert(payload, this.options(now));
    if (!insert) {
      return { outcome: 'skipped', tags: [], detail: 'payload had no usable name or code' };
    }

    if (dryRun) {
      return { outcome: 'created', tags: ['catalog'], detail: `would create ${insert.code}` };
    }

    const repository = manager.getRepository(Product);
    const product = repository.create({
      ...insert,
      slugEn: await this.freeSlug(manager, Product, 'slugEn', insert.slugEn, insert.code),
      slugAr: await this.freeSlug(manager, Product, 'slugAr', insert.slugAr, insert.code),
    });

    const saved = await repository.save(product);

    await this.reconcileImages(manager, saved, payload);
    const categoryTags = await this.reconcileCategoryLinks(manager, saved, payload);

    return {
      outcome: 'created',
      tags: [...this.productTags(saved), ...categoryTags],
      detail: `created ${saved.code}`,
    };
  }

  /**
   * SOFT delete, always.
   *
   * A quote request's items snapshot the product code and name, but they also
   * carry a `product_id` FK, and historical quotes have to stay readable. Hard
   * deleting would either break that link or cascade it away — losing the
   * record of what a customer actually asked for. Soft deletion also makes an
   * accidental upstream delete recoverable without a restore.
   */
  async deleteProduct(
    manager: EntityManager,
    payload: Record<string, unknown>,
    options: { dryRun?: boolean } = {},
  ): Promise<WriteResult> {
    const keys = productMatchKeys(payload);
    const existing = await this.findProduct(manager, keys.code, keys.sallaId);

    if (!existing) {
      return { outcome: 'skipped', tags: [], detail: 'product.deleted for an unknown product' };
    }
    if (existing.deletedAt !== null) {
      return { outcome: 'unchanged', tags: [], detail: `${existing.code} was already deleted` };
    }

    const tags = this.productTags(existing);
    if (options.dryRun) {
      return { outcome: 'deleted', tags, detail: `would soft-delete ${existing.code}` };
    }

    await manager.getRepository(Product).softDelete({ id: existing.id });
    return { outcome: 'deleted', tags, detail: `soft-deleted ${existing.code}` };
  }

  // --- images ------------------------------------------------------------

  private async reconcileImages(
    manager: EntityManager,
    product: Product,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // No `images` key at all means the payload has no opinion — a lean webhook
    // must not wipe a gallery it simply did not mention.
    if (!('images' in payload) && !('main_image' in payload)) return;

    const repository = manager.getRepository(ProductImage);
    const existing = await repository.find({
      where: { productId: product.id },
      order: { sortOrder: 'ASC' },
    });

    const incoming = parseImages(payload);
    const plan = planImageReconciliation(
      existing.map((image) => ({
        id: image.id,
        sallaId: image.sallaId,
        url: image.url,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
      incoming,
    );

    for (const image of plan.toInsert) {
      await repository.save(
        repository.create({
          productId: product.id,
          sallaId: image.sallaId,
          url: image.url,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
          // altEn / altAr are LOCAL-ONLY accessibility copy — never written here.
        }),
      );
    }

    for (const image of plan.toUpdate) {
      await repository.update(
        { id: image.id },
        { sortOrder: image.sortOrder, isPrimary: image.isPrimary, sallaId: image.sallaId },
      );
    }

    if (plan.toDeleteIds.length > 0) {
      await repository.delete({ id: In(plan.toDeleteIds) });
    }
  }

  // --- category links ----------------------------------------------------

  /**
   * Reconciles the join table and returns the cache tags of every category
   * whose listing changed — both the ones gained and the ones lost, since both
   * listings now render differently.
   */
  private async reconcileCategoryLinks(
    manager: EntityManager,
    product: Product,
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    if (!('categories' in payload)) return [];

    const sallaCategoryIds = parseCategoryIds(payload.categories);
    const categoryRepository = manager.getRepository(Category);

    const resolved =
      sallaCategoryIds.length === 0
        ? []
        : await categoryRepository.find({ where: { sallaId: In(sallaCategoryIds) } });

    if (resolved.length < sallaCategoryIds.length) {
      // Not an error: the category webhook may simply not have arrived yet, and
      // the next reconcile repairs the link.
      this.logger.debug(
        `Product ${product.code}: ${sallaCategoryIds.length - resolved.length} Salla category id(s) ` +
          `have no local counterpart yet; those links are deferred.`,
      );
    }

    const linkRepository = manager.getRepository(ProductCategory);
    const existingLinks = await linkRepository.find({ where: { productId: product.id } });

    const plan = planCategoryLinks(
      existingLinks.map((link) => link.categoryId),
      resolved.map((category) => category.id),
    );

    for (const categoryId of plan.toAdd) {
      await linkRepository.save(linkRepository.create({ productId: product.id, categoryId }));
    }

    if (plan.toRemove.length > 0) {
      await linkRepository.delete({ productId: product.id, categoryId: In(plan.toRemove) });
    }

    const touched = [...plan.toAdd, ...plan.toRemove];
    if (touched.length === 0) return [];

    const categories = await categoryRepository.find({ where: { id: In(touched) } });
    return categories.flatMap((category) => this.categoryTags(category));
  }

  // --- categories --------------------------------------------------------

  async upsertCategory(
    manager: EntityManager,
    payload: Record<string, unknown>,
    options: { now?: Date; dryRun?: boolean } = {},
  ): Promise<WriteResult> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const sallaId = stringifyId(payload.id);
    if (!sallaId) return { outcome: 'skipped', tags: [], detail: 'category payload carried no id' };

    const existing = await this.findCategory(manager, sallaId, payload);

    if (existing && isStalePayload(payload, existing.sallaUpdatedAt)) {
      return {
        outcome: 'skipped',
        tags: [],
        detail: `stale payload for category ${existing.slugEn}`,
      };
    }

    const repository = manager.getRepository(Category);

    if (existing) {
      const patch = toCategoryPatch(payload, this.options(now));
      if (dryRun) {
        return {
          outcome: 'updated',
          tags: this.categoryTags(existing),
          detail: `would update category ${existing.slugEn} (${Object.keys(patch).join(', ')})`,
        };
      }
      Object.assign(existing, patch);
      await repository.save(existing);
      return {
        outcome: 'updated',
        tags: this.categoryTags(existing),
        detail: `updated category ${existing.slugEn}`,
      };
    }

    const insert = toCategoryInsert(payload, this.options(now));
    if (!insert) return { outcome: 'skipped', tags: [], detail: 'category payload had no name' };

    if (dryRun) {
      return { outcome: 'created', tags: ['catalog'], detail: `would create category ${insert.slugEn}` };
    }

    const category = repository.create({
      ...insert,
      slugEn: await this.freeSlug(manager, Category, 'slugEn', insert.slugEn, `salla-${sallaId}`),
      slugAr: await this.freeSlug(manager, Category, 'slugAr', insert.slugAr, `salla-${sallaId}`),
    });
    const saved = await repository.save(category);

    return {
      outcome: 'created',
      tags: this.categoryTags(saved),
      detail: `created category ${saved.slugEn}`,
    };
  }

  /**
   * Links a Salla category to a local one by `sallaId`, then by NAME.
   *
   * Name is the fallback because a category has no SKU. It is the only thing
   * the seeded taxonomy and Salla's have in common on a first sync, and without
   * it every seeded category would be duplicated the moment Salla's categories
   * arrived. Matching is case-insensitive against BOTH locale columns, since
   * the store may be authored in either.
   */
  private async findCategory(
    manager: EntityManager,
    sallaId: string,
    payload: Record<string, unknown>,
  ): Promise<Category | null> {
    const repository = manager.getRepository(Category);

    const bySallaId = await repository.findOne({ where: { sallaId } });
    if (bySallaId) return bySallaId;

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (name === '') return null;

    return repository
      .createQueryBuilder('c')
      .where('c.salla_id IS NULL')
      .andWhere('(lower(c.name_en) = lower(:name) OR lower(c.name_ar) = lower(:name))', { name })
      .getOne();
  }

  /**
   * `category.deleted` DEACTIVATES rather than destroys.
   *
   * Deleting the row would cascade the product↔category links away, and a
   * product whose only category vanished becomes unreachable from the
   * navigation while still being a live, sellable product. Deactivating hides
   * the listing and leaves every product URL working.
   */
  async deleteCategory(
    manager: EntityManager,
    payload: Record<string, unknown>,
    options: { dryRun?: boolean } = {},
  ): Promise<WriteResult> {
    const sallaId = stringifyId(payload.id);
    if (!sallaId) return NO_OP;

    const existing = await manager.getRepository(Category).findOne({ where: { sallaId } });
    if (!existing) {
      return { outcome: 'skipped', tags: [], detail: 'category.deleted for an unknown category' };
    }
    if (!existing.isActive) {
      return { outcome: 'unchanged', tags: [], detail: `category ${existing.slugEn} already inactive` };
    }

    const tags = this.categoryTags(existing);
    if (options.dryRun) {
      return { outcome: 'deleted', tags, detail: `would deactivate category ${existing.slugEn}` };
    }

    existing.isActive = false;
    await manager.getRepository(Category).save(existing);
    return { outcome: 'deleted', tags, detail: `deactivated category ${existing.slugEn}` };
  }

  // --- helpers -----------------------------------------------------------

  /**
   * Finds a slug nobody else holds.
   *
   * The suffix strategy mirrors the seed's: append the product code, and only
   * then fall back to a counter. A slug is a public URL, so the first choice
   * has to be stable and meaningful rather than `-2`.
   */
  private async freeSlug(
    manager: EntityManager,
    entity: typeof Product | typeof Category,
    column: 'slugEn' | 'slugAr',
    base: string,
    code: string,
  ): Promise<string> {
    const repository = manager.getRepository(entity);
    const taken = async (candidate: string): Promise<boolean> =>
      (await repository.count({ where: { [column]: candidate }, withDeleted: true })) > 0;

    if (!(await taken(base))) return base;

    const suffixed = withSlugSuffix(base, code);
    if (suffixed !== base && !(await taken(suffixed))) return suffixed;

    for (let counter = 2; counter < 100; counter += 1) {
      const candidate = `${suffixed}-${counter}`;
      if (!(await taken(candidate))) return candidate;
    }

    throw new Error(`Could not find a free ${column} for "${base}" after 100 attempts.`);
  }

  /**
   * Cache tags for a product — BOTH locale slugs.
   *
   * The site fetches with the slug from the URL it is rendering, so
   * `product:كوب-…` and `product:single-wall-…` are two different cache entries
   * for the same row. Purging one would leave the other locale stale.
   */
  productTags(product: Pick<Product, 'slugEn' | 'slugAr'>): string[] {
    return ['catalog', `product:${product.slugEn}`, `product:${product.slugAr}`];
  }

  categoryTags(category: Pick<Category, 'slugEn' | 'slugAr'>): string[] {
    return ['catalog', `category:${category.slugEn}`, `category:${category.slugAr}`];
  }

  /**
   * Local products that came from Salla — the ONLY rows a reconcile may
   * soft-delete. See ReconcileService for why this predicate is load-bearing.
   */
  sallaSourcedProducts(manager: EntityManager): Promise<Product[]> {
    return manager.getRepository(Product).find({
      where: { sallaId: Not(IsNull()) },
      select: ['id', 'code', 'sallaId', 'slugEn', 'slugAr', 'sallaUpdatedAt', 'deletedAt'],
    });
  }
}
