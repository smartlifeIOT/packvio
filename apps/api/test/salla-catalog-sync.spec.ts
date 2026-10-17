import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import { configuration, ENV_FILE_PATHS } from '../src/config/configuration';
import { DatabaseModule } from '../src/database/database.module';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { Category } from '../src/modules/catalog/entities/category.entity';
import { ProductCategory } from '../src/modules/catalog/entities/product-category.entity';
import { ProductImage } from '../src/modules/catalog/entities/product-image.entity';
import { Product, ProductStatus } from '../src/modules/catalog/entities/product.entity';
import { SallaCatalogWriterService } from '../src/modules/sync/catalog/salla-catalog-writer.service';
import {
  CATEGORY_CREATED,
  CATEGORY_DELETED,
  CATEGORY_UPDATED,
  CATEGORY_UPDATED_STALE,
  PRODUCT_CREATED,
  PRODUCT_CREATED_NEW,
  PRODUCT_DELETED,
  PRODUCT_UPDATED,
  PRODUCT_UPDATED_HOSTILE,
  PRODUCT_UPDATED_NO_PRICE,
  PRODUCT_UPDATED_OUT_OF_STOCK,
  PRODUCT_UPDATED_STALE,
} from './fixtures/salla';
import { describeWithDb } from './setup-db';

/**
 * The Salla → Postgres mirror, against the REAL seeded database.
 *
 * These are the assertions that cannot be made honestly against a mock: that
 * matching on SKU finds the seeded row instead of inserting a 214th product,
 * that a reconcile against an empty upstream catalog leaves the seeded 213
 * standing, and that a Salla rename does not move a live URL. A stubbed
 * repository would answer whatever the test asked it to.
 *
 * Every test runs inside a transaction that is ROLLED BACK, so the seeded
 * catalog the rest of the suite depends on is never actually modified.
 */

const data = (fixture: { data: unknown }): Record<string, unknown> =>
  fixture.data as Record<string, unknown>;

describeWithDb('Salla catalog sync', () => {
  let dataSource: DataSource;
  let writer: SallaCatalogWriterService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: ENV_FILE_PATHS,
          load: [configuration],
        }),
        ObservabilityModule,
        DatabaseModule,
      ],
      providers: [SallaCatalogWriterService],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    if (!dataSource.isInitialized) await dataSource.initialize();

    writer = new SallaCatalogWriterService(moduleRef.get(ConfigService));
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /**
   * Runs `work` inside a transaction and rolls it back.
   *
   * The seeded catalog is shared with the catalog-API suite, so these tests
   * must leave it byte-identical. Rolling back is the only way to exercise real
   * writes — including the unique constraints and the generated column — while
   * guaranteeing that.
   */
  async function inRollback<T>(work: (manager: DataSource['manager']) => Promise<T>): Promise<T> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    /**
     * REPEATABLE READ, not the default READ COMMITTED.
     *
     * Several of these tests assert a COUNT delta — "213 stays 213, not 214" is
     * the whole point of the SKU-matching test. Under READ COMMITTED a row
     * committed by a CONCURRENT suite between the before-count and the
     * after-count becomes visible and breaks the delta, which is exactly what
     * the reconcile suite's temporary orphan row did. A repeatable snapshot
     * makes each test see one consistent version of the catalog for its whole
     * duration, regardless of what else jest is running in parallel.
     */
    await runner.startTransaction('REPEATABLE READ');
    try {
      return await work(runner.manager);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  describe('SKU matching', () => {
    it('updates the SEEDED row for SKU PCS/08 instead of creating a duplicate', async () => {
      await inRollback(async (manager) => {
        const before = await manager.getRepository(Product).count();
        const seeded = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        expect(seeded.sallaId).toBeNull(); // seed-only until now

        const result = await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        expect(result.outcome).toBe('updated');

        const after = await manager.getRepository(Product).count();
        // The whole point: 213 stays 213, not 214.
        expect(after).toBe(before);

        const updated = await manager.getRepository(Product).findOneOrFail({
          where: { id: seeded.id },
        });
        expect(updated.sallaId).toBe('445566778');
        expect(updated.price).toBe(42.5);
      });
    });

    it('matches case-insensitively, so "pcs/08" is not a second product', async () => {
      await inRollback(async (manager) => {
        const before = await manager.getRepository(Product).count();
        const result = await writer.upsertProduct(manager, {
          ...data(PRODUCT_CREATED),
          sku: 'pcs/08',
        });
        expect(result.outcome).toBe('updated');
        expect(await manager.getRepository(Product).count()).toBe(before);
      });
    });

    it('falls back to sallaId when the SKU has been edited upstream', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        const before = await manager.getRepository(Product).count();

        const renamed = { ...data(PRODUCT_UPDATED), sku: 'SKU-CHANGED-IN-SALLA' };
        const result = await writer.upsertProduct(manager, renamed);

        expect(result.outcome).toBe('updated');
        expect(await manager.getRepository(Product).count()).toBe(before);

        // The code is NOT rewritten — it is the join key and not on the allowlist.
        const row = await manager.getRepository(Product).findOneOrFail({
          where: { sallaId: '445566778' },
        });
        expect(row.code).toBe('PCS/08');
      });
    });

    it('inserts a genuinely new product Salla has and the seed does not', async () => {
      await inRollback(async (manager) => {
        const before = await manager.getRepository(Product).count();
        const result = await writer.upsertProduct(manager, data(PRODUCT_CREATED_NEW));

        expect(result.outcome).toBe('created');
        expect(await manager.getRepository(Product).count()).toBe(before + 1);

        const created = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'NEW/SALLA/001' },
        });
        expect(created.slugEn).toBe('bamboo-cutlery-set');
        expect(created.isStockUnlimited).toBe(true);
      });
    });
  });

  describe('local-only columns', () => {
    it('leaves every curated column untouched when a hostile payload arrives', async () => {
      await inRollback(async (manager) => {
        const repository = manager.getRepository(Product);
        const before = await repository.findOneOrFail({ where: { code: 'PCS/08' } });

        // Give the row distinctive curated values first.
        await repository.update(
          { id: before.id },
          {
            isFeatured: true,
            supportsCustomPrinting: true,
            sortOrder: 7,
            metaTitleEn: 'Curated meta title',
            metaTitleAr: 'عنوان مختار',
            metaDescriptionEn: 'Curated meta description',
          },
        );

        await writer.upsertProduct(manager, data(PRODUCT_UPDATED_HOSTILE));

        const after = await repository.findOneOrFail({ where: { id: before.id } });

        expect(after.slugEn).toBe(before.slugEn);
        expect(after.slugAr).toBe(before.slugAr);
        expect(after.isFeatured).toBe(true);
        expect(after.supportsCustomPrinting).toBe(true);
        expect(after.fulfilmentMode).toBe(before.fulfilmentMode);
        expect(after.sortOrder).toBe(7);
        expect(after.metaTitleEn).toBe('Curated meta title');
        expect(after.metaTitleAr).toBe('عنوان مختار');
        expect(after.metaDescriptionEn).toBe('Curated meta description');
        expect(after.code).toBe('PCS/08');

        // Size, material and case quantity come from the printed catalog and
        // have no Salla source — a sync must not null them out.
        expect(after.size).toBe(before.size);
        expect(after.material).toBe(before.material);
        expect(after.caseQuantity).toBe(before.caseQuantity);

        // …while the mirrored half DID change.
        expect(after.price).toBe(50);
      });
    });

    it('leaves a curated Arabic name alone when the store is authored in English', async () => {
      await inRollback(async (manager) => {
        const repository = manager.getRepository(Product);
        const before = await repository.findOneOrFail({ where: { code: 'PCS/08' } });

        // Default store locale is `ar`, so force the English-store path.
        const englishWriter = new SallaCatalogWriterService({
          get: () => ({ storeLocale: 'en' }),
        } as unknown as ConfigService);

        await englishWriter.upsertProduct(manager, data(PRODUCT_UPDATED));

        const after = await repository.findOneOrFail({ where: { id: before.id } });
        expect(after.nameAr).toBe(before.nameAr);
        expect(after.nameEn).toBe('Single Wall Coffee Cup 8 oz — Kraft');
      });
    });
  });

  describe('slug immutability', () => {
    it('does not move a live URL when Salla renames the product', async () => {
      await inRollback(async (manager) => {
        const repository = manager.getRepository(Product);
        const before = await repository.findOneOrFail({ where: { code: 'PCS/08' } });

        await writer.upsertProduct(manager, data(PRODUCT_UPDATED_HOSTILE));

        const after = await repository.findOneOrFail({ where: { id: before.id } });
        expect(after.slugEn).toBe(before.slugEn);
        expect(after.slugAr).toBe(before.slugAr);
        expect(after.nameAr).toBe('Renamed In Salla');
      });
    });

    it('gives a new product a collision-free slug', async () => {
      await inRollback(async (manager) => {
        const seeded = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });

        // A Salla product whose name slugifies onto a slug already in use.
        const result = await writer.upsertProduct(manager, {
          id: 999000111,
          sku: 'COLLIDE/001',
          name: seeded.nameEn,
          status: 'sale',
          updated_at: '2026-08-19T10:00:00+03:00',
        });

        expect(result.outcome).toBe('created');
        const created = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'COLLIDE/001' },
        });
        expect(created.slugEn).not.toBe(seeded.slugEn);
        expect(created.slugEn).toContain('collide-001');
      });
    });
  });

  describe('out-of-order protection', () => {
    it('skips a payload older than the row it would overwrite', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_UPDATED));
        const applied = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        expect(applied.nameAr).toBe('Single Wall Coffee Cup 8 oz — Kraft');

        const result = await writer.upsertProduct(manager, data(PRODUCT_UPDATED_STALE));

        expect(result.outcome).toBe('skipped');
        expect(result.detail).toMatch(/stale/i);

        const after = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        expect(after.nameAr).toBe('Single Wall Coffee Cup 8 oz — Kraft');
        expect(after.nameAr).not.toBe('STALE NAME THAT MUST NOT WIN');
      });
    });

    it('skips a stale CATEGORY payload too', async () => {
      await inRollback(async (manager) => {
        await writer.upsertCategory(manager, data(CATEGORY_CREATED));
        await writer.upsertCategory(manager, data(CATEGORY_UPDATED));

        const result = await writer.upsertCategory(manager, data(CATEGORY_UPDATED_STALE));
        expect(result.outcome).toBe('skipped');

        const after = await manager.getRepository(Category).findOneOrFail({
          where: { sallaId: '301001' },
        });
        expect(after.nameAr).not.toBe('STALE CATEGORY NAME THAT MUST NOT WIN');
      });
    });
  });

  describe('status and price', () => {
    it('maps out-of-stock', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_UPDATED_OUT_OF_STOCK));
        const row = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/12' },
        });
        expect(row.status).toBe(ProductStatus.OutOfStock);
        expect(row.stockQuantity).toBe(0);
      });
    });

    it('stores a null price as null, never zero', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_UPDATED_NO_PRICE));
        const row = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'WT-KS508' },
        });
        expect(row.price).toBeNull();
      });
    });
  });

  describe('images', () => {
    it('inserts the gallery with one primary, in order', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        const product = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });

        const images = await manager.getRepository(ProductImage).find({
          where: { productId: product.id },
          order: { sortOrder: 'ASC' },
        });

        expect(images).toHaveLength(2);
        expect(images.filter((image) => image.isPrimary)).toHaveLength(1);
        expect(images[0]?.isPrimary).toBe(true);
        expect(images[0]?.url).toBe('https://cdn.salla.sa/packvio/pcs08-main.jpg');
      });
    });

    it('removes an image Salla dropped and adds the one it gained', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        await writer.upsertProduct(manager, data(PRODUCT_UPDATED));

        const product = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        const urls = (
          await manager.getRepository(ProductImage).find({ where: { productId: product.id } })
        ).map((image) => image.url);

        expect(urls).toContain('https://cdn.salla.sa/packvio/pcs08-kraft.jpg');
        expect(urls).not.toContain('https://cdn.salla.sa/packvio/pcs08-main.jpg');
      });
    });

    it('leaves the gallery alone when the payload mentions no images at all', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        const product = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        const before = await manager.getRepository(ProductImage).countBy({ productId: product.id });

        await writer.upsertProduct(manager, {
          id: 445566778,
          sku: 'PCS/08',
          name: 'No images mentioned',
          updated_at: '2026-08-20T10:00:00+03:00',
        });

        expect(await manager.getRepository(ProductImage).countBy({ productId: product.id })).toBe(
          before,
        );
      });
    });
  });

  describe('category links', () => {
    it('links a product to a category and removes it when Salla does', async () => {
      await inRollback(async (manager) => {
        // Link the seeded coffee-cups category to Salla id 301001 first.
        await writer.upsertCategory(manager, data(CATEGORY_CREATED));
        const category = await manager.getRepository(Category).findOneOrFail({
          where: { sallaId: '301001' },
        });

        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        const product = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });

        const linked = await manager.getRepository(ProductCategory).findOne({
          where: { productId: product.id, categoryId: category.id },
        });
        expect(linked).not.toBeNull();

        // Now Salla says the product is in NO categories.
        await writer.upsertProduct(manager, {
          id: 445566778,
          sku: 'PCS/08',
          categories: [],
          updated_at: '2026-08-21T10:00:00+03:00',
        });

        const after = await manager.getRepository(ProductCategory).findOne({
          where: { productId: product.id, categoryId: category.id },
        });
        expect(after).toBeNull();
      });
    });

    it('matches a seeded category by NAME on first contact, not by creating a duplicate', async () => {
      await inRollback(async (manager) => {
        const before = await manager.getRepository(Category).count();
        const result = await writer.upsertCategory(manager, data(CATEGORY_CREATED));

        expect(result.outcome).toBe('updated');
        expect(await manager.getRepository(Category).count()).toBe(before);

        const matched = await manager.getRepository(Category).findOneOrFail({
          where: { sallaId: '301001' },
        });
        expect(matched.slugEn).toBe('coffee-cups');
      });
    });
  });

  describe('deletion', () => {
    it('SOFT deletes a product so historical quotes still resolve it', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        const result = await writer.deleteProduct(manager, data(PRODUCT_DELETED));
        expect(result.outcome).toBe('deleted');

        const visible = await manager.getRepository(Product).findOne({
          where: { code: 'PCS/08' },
        });
        expect(visible).toBeNull();

        const withDeleted = await manager.getRepository(Product).findOne({
          where: { code: 'PCS/08' },
          withDeleted: true,
        });
        expect(withDeleted).not.toBeNull();
        expect(withDeleted?.deletedAt).not.toBeNull();
      });
    });

    it('RESTORES a soft-deleted product when Salla talks about it again', async () => {
      await inRollback(async (manager) => {
        await writer.upsertProduct(manager, data(PRODUCT_CREATED));
        await writer.deleteProduct(manager, data(PRODUCT_DELETED));

        const result = await writer.upsertProduct(manager, {
          ...data(PRODUCT_UPDATED),
          updated_at: '2026-08-22T10:00:00+03:00',
        });

        expect(result.outcome).toBe('updated');
        expect(result.detail).toMatch(/restored/i);

        const alive = await manager.getRepository(Product).findOne({ where: { code: 'PCS/08' } });
        expect(alive).not.toBeNull();
      });
    });

    it('DEACTIVATES a deleted category rather than destroying it', async () => {
      await inRollback(async (manager) => {
        await writer.upsertCategory(manager, data({ data: { ...data(CATEGORY_CREATED), id: 301099, name: 'Seasonal Packaging' } }));
        const result = await writer.deleteCategory(manager, data(CATEGORY_DELETED));

        expect(result.outcome).toBe('deleted');
        const row = await manager.getRepository(Category).findOneOrFail({
          where: { sallaId: '301099' },
        });
        expect(row.isActive).toBe(false);
      });
    });
  });

  describe('dry run', () => {
    it('reports what it would do and writes nothing', async () => {
      await inRollback(async (manager) => {
        const before = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });

        const result = await writer.upsertProduct(manager, data(PRODUCT_UPDATED), {
          dryRun: true,
        });

        expect(result.outcome).toBe('updated');
        expect(result.detail).toMatch(/^would update/);

        const after = await manager.getRepository(Product).findOneOrFail({
          where: { code: 'PCS/08' },
        });
        expect(after.price).toBe(before.price);
        expect(after.nameAr).toBe(before.nameAr);
        expect(after.sallaId).toBe(before.sallaId);
      });
    });
  });

  describe('the seed-only protection predicate', () => {
    it('returns ONLY rows with a salla_id — never the seeded 213', async () => {
      await inRollback(async (manager) => {
        const seedOnly = await manager.getRepository(Product).count({
          where: { sallaId: IsNull() },
        });
        expect(seedOnly).toBeGreaterThan(200);

        const sourced = await writer.sallaSourcedProducts(manager);
        expect(sourced.every((product) => product.sallaId !== null)).toBe(true);

        // Before any sync has run, nothing is Salla-sourced — so the delete
        // pass has nothing to consider, which is exactly the protection.
        const withSallaId = await manager
          .getRepository(Product)
          .count({ where: { sallaId: Not(IsNull()) } });
        expect(sourced).toHaveLength(withSallaId);
      });
    });
  });
});
