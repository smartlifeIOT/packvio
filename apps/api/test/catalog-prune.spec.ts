import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { configuration, ENV_FILE_PATHS } from '../src/config/configuration';
import { DatabaseModule } from '../src/database/database.module';
import { loadCatalogSource } from '../src/database/seeds/catalog-source';
import { applyPrune, planPrune, pruneExceedsBlastRadius } from '../src/database/seeds/prune';
import { Product } from '../src/modules/catalog/entities/product.entity';
import { describeWithDb } from './setup-db';

/**
 * The prune, against a real database, reproducing the exact mess it exists for.
 *
 * The situation is specific and cannot be set up with mocks: a product's code
 * changed between two generations of catalog.json, so the seed created a new
 * row, found the clean slug held by the old one, and filed the new product under
 * `<slug>-<code suffix>`. Two products, the stale one on the clean URL. Proving
 * the prune untangles that means proving a unique index releases a slug only
 * after the orphan is renamed — which is a fact about Postgres, not about this
 * TypeScript, and a stub repository would assert nothing.
 *
 * Every row these tests create carries a PRUNE-TEST- code prefix and is deleted
 * afterwards, so they can run against the ordinary seeded development database
 * without disturbing it.
 */

const PREFIX = 'PRUNE-TEST-';

/** An invented source catalogue. Only the three fields slug planning reads. */
type SourceProduct = { code: string; nameEn: string; nameAr: string };

describeWithDb('Catalog prune', () => {
  let dataSource: DataSource;

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
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    if (!dataSource.isInitialized) await dataSource.initialize();
  });

  afterEach(async () => {
    // Hard delete, including soft-deleted rows the prune archived.
    await dataSource
      .getRepository(Product)
      .createQueryBuilder()
      .delete()
      .where('code LIKE :prefix', { prefix: `${PREFIX}%` })
      .execute();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function insert(rows: Array<Partial<Product> & { code: string }>): Promise<void> {
    const repository = dataSource.getRepository(Product);
    for (const row of rows) {
      await repository.save(
        repository.create({
          nameEn: row.nameEn ?? row.code,
          nameAr: row.nameAr ?? row.code,
          ...row,
        }),
      );
    }
  }

  async function byCode(code: string): Promise<Product | null> {
    return dataSource.getRepository(Product).findOne({ where: { code }, withDeleted: true });
  }

  /**
   * Runs plan + apply in one transaction, as the script does, with the REAL
   * catalogue folded into the source.
   *
   * That last part is not tidiness. The first version of this helper passed
   * only the test's own products, which made all 213 seeded rows orphans — and
   * `apply: true` archived every one of them. It is a faithful demonstration of
   * what the tool does with the wrong input file (and the reason the blast
   * radius guard now exists), but it is not a test of anything these cases
   * claim to test. So the source is the real catalogue PLUS the test rows, and
   * the assertions are scoped to the PRUNE-TEST- prefix.
   */
  async function prune(source: SourceProduct[], { apply }: { apply: boolean }) {
    const real = loadCatalogSource().products.map((product) => ({
      code: product.code,
      nameEn: product.nameEn,
      nameAr: product.nameAr,
    }));

    return dataSource.transaction(async (manager) => {
      const result = await planPrune(manager, [...real, ...source]);
      if (apply) await applyPrune(manager, result.orphans, result.reclaims);
      return {
        orphans: result.orphans.filter((orphan) => orphan.code.startsWith(PREFIX)),
        reclaims: result.reclaims.filter((reclaim) => reclaim.code.startsWith(PREFIX)),
        all: result,
      };
    });
  }

  describe('the situation it was built for', () => {
    // The old catalogue called it CB-19; the new one calls it CB19. Same
    // product, different code — so the seed created a second row.
    const OLD = `${PREFIX}CB-19`;
    const NEW = `${PREFIX}CB19`;

    const source: SourceProduct[] = [
      { code: NEW, nameEn: 'Prune Test Carry Bag', nameAr: 'كيس اختبار' },
    ];

    beforeEach(async () => {
      await insert([
        {
          code: OLD,
          nameEn: 'Prune Test Carry Bag',
          nameAr: 'كيس اختبار',
          slugEn: 'prune-test-carry-bag',
          slugAr: 'كيس-اختبار',
        },
        {
          code: NEW,
          nameEn: 'Prune Test Carry Bag',
          nameAr: 'كيس اختبار',
          // What the seed writes when it loses the collision.
          slugEn: 'prune-test-carry-bag-prune-test-cb19',
          slugAr: 'كيس-اختبار-prune-test-cb19',
        },
      ]);
    });

    it('reports both halves of the problem without writing anything', async () => {
      const { orphans, reclaims } = await prune(source, { apply: false });

      expect(orphans.map((o) => o.code)).toEqual([OLD]);
      expect(reclaims.map((r) => r.code)).toEqual([NEW]);
      expect(reclaims[0].toEn).toBe('prune-test-carry-bag');

      // Dry run: the table is untouched.
      expect((await byCode(OLD))?.deletedAt).toBeNull();
      expect((await byCode(NEW))?.slugEn).toBe('prune-test-carry-bag-prune-test-cb19');
    });

    it('archives the orphan and moves the survivor onto the clean slug', async () => {
      await prune(source, { apply: true });

      const old = await byCode(OLD);
      expect(old?.deletedAt).not.toBeNull();
      // Renamed, not merely soft-deleted. uq_products_slug_en is a plain unique
      // index, so a soft-deleted row goes on holding its slug — this is the
      // assertion that would fail if the rename were dropped as redundant.
      expect(old?.slugEn).toBe('archived-prune-test-cb-19-prune-test-carry-bag');

      const current = await byCode(NEW);
      expect(current?.deletedAt).toBeNull();
      expect(current?.slugEn).toBe('prune-test-carry-bag');
      expect(current?.slugAr).toBe('كيس-اختبار');
    });

    it('is idempotent — a second run finds nothing to do', async () => {
      await prune(source, { apply: true });
      const second = await prune(source, { apply: false });

      expect(second.orphans).toEqual([]);
      expect(second.reclaims).toEqual([]);
    });
  });

  describe('what it refuses to touch', () => {
    it('leaves a suffixed slug alone while a LIVE product still holds the base', async () => {
      // Two different products whose names both slugify to the same thing. The
      // suffix is load-bearing here, not debris, and moving it would collide.
      const keeper = `${PREFIX}K1`;
      const other = `${PREFIX}K2`;

      await insert([
        {
          code: keeper,
          nameEn: 'Prune Test Shared Name',
          nameAr: 'اسم مشترك اختبار',
          slugEn: 'prune-test-shared-name',
          slugAr: 'اسم-مشترك-اختبار',
        },
        {
          code: other,
          nameEn: 'Prune Test Shared Name',
          nameAr: 'اسم مشترك اختبار',
          slugEn: 'prune-test-shared-name-prune-test-k2',
          slugAr: 'اسم-مشترك-اختبار-prune-test-k2',
        },
      ]);

      // BOTH are in the source, so neither is an orphan and nothing is freed.
      const { orphans, reclaims } = await prune(
        [
          { code: keeper, nameEn: 'Prune Test Shared Name', nameAr: 'اسم مشترك اختبار' },
          { code: other, nameEn: 'Prune Test Shared Name', nameAr: 'اسم مشترك اختبار' },
        ],
        { apply: false },
      );

      expect(orphans).toEqual([]);
      expect(reclaims).toEqual([]);
    });

    it('does not move a slug that merely looks similar to its planned one', async () => {
      // `-promo` is not this product's code suffix, so it is somebody's
      // deliberate URL and the prune has no business rewriting it.
      const code = `${PREFIX}P1`;
      await insert([
        {
          code,
          nameEn: 'Prune Test Promo Item',
          nameAr: 'عنصر ترويجي اختبار',
          slugEn: 'prune-test-promo-item-promo',
          slugAr: 'عنصر-ترويجي-اختبار-promo',
        },
      ]);

      const { reclaims } = await prune(
        [{ code, nameEn: 'Prune Test Promo Item', nameAr: 'عنصر ترويجي اختبار' }],
        { apply: false },
      );

      expect(reclaims).toEqual([]);
    });

    it('never reports a product that is in the source as an orphan', async () => {
      const code = `${PREFIX}S1`;
      await insert([
        {
          code,
          nameEn: 'Prune Test Survivor',
          nameAr: 'باقي اختبار',
          slugEn: 'prune-test-survivor',
          slugAr: 'باقي-اختبار',
        },
      ]);

      const { orphans } = await prune(
        [{ code, nameEn: 'Prune Test Survivor', nameAr: 'باقي اختبار' }],
        { apply: false },
      );

      expect(orphans).toEqual([]);
    });

    it('leaves rows it already archived in a previous run exactly as they are', async () => {
      const code = `${PREFIX}A1`;
      await insert([
        {
          code,
          nameEn: 'Prune Test Already Archived',
          nameAr: 'مؤرشف اختبار',
          slugEn: 'archived-prune-test-a1-prune-test-already-archived',
          slugAr: 'archived-prune-test-a1-مؤرشف-اختبار',
          deletedAt: new Date(),
        },
      ]);

      const { orphans } = await prune([], { apply: false });

      expect(orphans.map((o) => o.code)).not.toContain(code);
    });
  });

  describe('the blast-radius guard', () => {
    it('allows a small, ordinary prune', () => {
      expect(pruneExceedsBlastRadius(3, 213)).toBe(false);
      expect(pruneExceedsBlastRadius(10, 213)).toBe(false);
      // A code renumbering of 40 products in a 213-product catalogue is large
      // but believable, and under a quarter.
      expect(pruneExceedsBlastRadius(40, 213)).toBe(false);
    });

    it('refuses the shape that would wipe the catalogue', () => {
      // The exact case this suite caused: a one-product source against a
      // seeded database.
      expect(pruneExceedsBlastRadius(213, 214)).toBe(true);
      expect(pruneExceedsBlastRadius(80, 213)).toBe(true);
    });

    it('does not trip on a small catalogue, where a quarter is a rounding error', () => {
      // 25% of 12 is 3, which would make any real cleanup of a young catalogue
      // impossible. The absolute floor is what prevents that.
      expect(pruneExceedsBlastRadius(5, 12)).toBe(false);
      expect(pruneExceedsBlastRadius(10, 12)).toBe(false);
      expect(pruneExceedsBlastRadius(11, 12)).toBe(true);
    });
  });

  describe('the real catalogue', () => {
    it('reports no orphan whose code is in catalog.json', async () => {
      // The invariant that matters: whatever the prune proposes removing must
      // be absent from the source file. A row it proposes while the source
      // still lists it would be a straight bug.
      const codes = new Set(loadCatalogSource().products.map((product) => product.code));
      const { all } = await prune([], { apply: false });

      expect(all.orphans.filter((orphan) => codes.has(orphan.code))).toEqual([]);
    });

    it('leaves products the SEED skipped alone', async () => {
      // 18 shaker SKUs were skipped by a deployed seed for an unresolvable
      // category. They are still listed in catalog.json, so they are not
      // orphans — the prune reads the raw source, not the seed's validated
      // subset. Getting this backwards would archive a product because of a
      // typo in its category name.
      const { all } = await prune([], { apply: false });
      const shakers = all.orphans.filter((orphan) => orphan.code.startsWith('SKR'));

      expect(shakers).toEqual([]);
    });
  });

  it('keeps the test prefix out of the catalog proper', async () => {
    // Guards the cleanup in afterEach: a leaked PRUNE-TEST- row would show up
    // on the site.
    const leaked = await dataSource
      .getRepository(Product)
      .find({ withDeleted: true, where: { code: In([`${PREFIX}CB19`, `${PREFIX}CB-19`]) } });

    expect(leaked).toEqual([]);
  });
});
