import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { configuration, ENV_FILE_PATHS } from '../src/config/configuration';
import { DatabaseModule } from '../src/database/database.module';
import { Product } from '../src/modules/catalog/entities/product.entity';
import { ReconcileService } from '../src/modules/sync/catalog/reconcile.service';
import { SallaCatalogWriterService } from '../src/modules/sync/catalog/salla-catalog-writer.service';
import type { SallaApiService } from '../src/modules/sync/client/salla-api.service';
import type { SallaListResponse } from '../src/modules/sync/client/dto/salla-api.dto';
import { SyncRun } from '../src/modules/sync/entities/sync-run.entity';
import { RevalidationService } from '../src/modules/sync/revalidation/revalidation.service';
import { CATEGORY_LIST_PAGE_1, PRODUCT_LIST_PAGES } from './fixtures/salla';
import { describeWithDb } from './setup-db';

/**
 * Reconciliation, against the REAL seeded database.
 *
 * The assertion this file exists for is the destructive one: a reconcile must
 * NEVER soft-delete a product whose `salla_id` is null. Those are the seeded
 * 213 — they came from the printed catalog and have never existed in Salla, so
 * their absence upstream is not evidence of anything. Getting this wrong wipes
 * the entire site in a job that logs "succeeded".
 */

type LoosePage = SallaListResponse<Record<string, unknown>>;

/**
 * A stand-in for SallaApiService that serves fixture pages.
 *
 * `paginate` CALLS the `fetchPage` callback it is handed, exactly as the real
 * client does, so the caller's own choice of endpoint decides what comes back.
 * An earlier version sniffed the callback's source text to guess which endpoint
 * was wanted, which worked but would have broken silently the moment the
 * service was refactored to pass a bound method.
 *
 * It stops on an empty page, which is what makes the SHORT final fixture page
 * a real test of the loop rather than of the `totalPages` metadata.
 */
function fakeApi(pages: LoosePage[], categoryPages: LoosePage[] = []): SallaApiService {
  const page = (source: LoosePage[], index: number): LoosePage =>
    source[index - 1] ?? { data: [] };

  const api = {
    listProducts: (query: { page?: number }) => Promise.resolve(page(pages, query.page ?? 1)),
    listCategories: (query: { page?: number }) =>
      Promise.resolve(page(categoryPages, query.page ?? 1)),

    paginate: async function* (
      fetchPage: (page: number, perPage: number) => Promise<LoosePage>,
    ): AsyncGenerator<Record<string, unknown>[]> {
      for (let current = 1; current <= 50; current += 1) {
        const response = await fetchPage(current, 3);
        const items = response.data ?? [];
        if (items.length === 0) return;
        yield items;

        const totalPages = response.pagination?.totalPages;
        if (typeof totalPages === 'number' && current >= totalPages) return;
        if (totalPages === undefined && items.length < 3) return;
      }
    },
  };

  return api as unknown as SallaApiService;
}

/** Collects revalidation batches instead of sending them. */
class RecordingRevalidation extends RevalidationService {
  readonly sent: string[][] = [];

  constructor() {
    super({} as never, {} as never);
  }

  override revalidate(batch: ReturnType<RevalidationService['createBatch']>): Promise<boolean> {
    this.sent.push(batch.resolve());
    return Promise.resolve(true);
  }
}

describeWithDb('Salla reconcile', () => {
  let dataSource: DataSource;
  let writer: SallaCatalogWriterService;
  let config: ConfigService;

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

    config = moduleRef.get(ConfigService);
    writer = new SallaCatalogWriterService(config);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  function build(pages: LoosePage[], categoryPages: LoosePage[] = []) {
    const revalidation = new RecordingRevalidation();
    const service = new ReconcileService(
      dataSource.getRepository(SyncRun),
      dataSource,
      fakeApi(pages, categoryPages),
      writer,
      revalidation,
    );
    return { service, revalidation };
  }

  describe('the seed-only guarantee', () => {
    it('leaves the seeded catalog standing against an EMPTY upstream catalog', async () => {
      const repository = dataSource.getRepository(Product);
      const before = await repository.count();
      const seedOnlyBefore = await repository.count({ where: { sallaId: IsNull() } });

      expect(seedOnlyBefore).toBeGreaterThan(200);

      // APPLY mode, not a dry run — this is the run that would do the damage.
      const { service } = build([{ data: [] }]);
      const summary = await service.reconcile({ dryRun: false });

      expect(summary.deleted).toBe(0);
      expect(summary.seedOnlyProtected).toBe(seedOnlyBefore);

      const after = await repository.count();
      const softDeleted = await repository.count({
        where: { deletedAt: Not(IsNull()) },
        withDeleted: true,
      });

      // Every seeded product still visible, none soft-deleted by this run.
      expect(after).toBe(before);
      expect(softDeleted).toBe(0);

      // Clean up the SyncRun row this apply-mode run wrote.
      if (summary.runId) await dataSource.getRepository(SyncRun).delete({ id: summary.runId });
    });

    it('does not propose deleting a single salla_id-null row, even with a NON-empty upstream', async () => {
      // The empty-catalog guard cannot be what saves us here: upstream has 8
      // products, none of which correspond to the 200+ seeded rows.
      const { service } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[], [
        CATEGORY_LIST_PAGE_1 as LoosePage,
      ]);

      const summary = await service.reconcile({ dryRun: true });

      const deletions = summary.changes.filter((change) => change.kind === 'deleted');
      expect(deletions).toEqual([]);
      expect(summary.deleted).toBe(0);
      expect(summary.seedOnlyProtected).toBeGreaterThan(200);

      // 8 products + 3 categories — proves the category pass really ran, so
      // the absence of deletions is not just an unreached code path.
      expect(summary.seen).toBe(11);
      expect(summary.changes.some((change) => change.entity === 'category')).toBe(true);
    });

    it('DOES propose deleting a Salla-sourced row that vanished upstream', async () => {
      // The other half of the rule: the filter must not be so broad that it
      // protects everything and the delete pass never fires at all.
      const repository = dataSource.getRepository(Product);
      const orphan = await repository.save(
        repository.create({
          code: 'RECONCILE-TEST/ORPHAN',
          slugEn: 'reconcile-test-orphan',
          slugAr: 'reconcile-test-orphan-ar',
          nameEn: 'Reconcile Test Orphan',
          nameAr: 'منتج اختبار',
          sallaId: '999999999999',
        }),
      );

      try {
        const { service } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[]);
        const summary = await service.reconcile({ dryRun: true });

        const deletions = summary.changes.filter((change) => change.kind === 'deleted');
        expect(deletions).toHaveLength(1);
        expect(deletions[0]?.detail).toContain('RECONCILE-TEST/ORPHAN');
        expect(deletions[0]?.detail).toMatch(/^would soft-delete/);

        // A dry run must not have actually deleted it.
        const still = await repository.findOne({ where: { id: orphan.id } });
        expect(still?.deletedAt ?? null).toBeNull();
      } finally {
        await repository.delete({ id: orphan.id });
      }
    });
  });

  describe('dry run', () => {
    it('writes nothing and records no SyncRun', async () => {
      const products = dataSource.getRepository(Product);
      const runs = dataSource.getRepository(SyncRun);

      const before = await products.findOneOrFail({ where: { code: 'PCS/08' } });
      const runsBefore = await runs.count();

      const { service } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[]);
      const summary = await service.reconcile({ dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(summary.runId).toBeNull();
      expect(await runs.count()).toBe(runsBefore);

      const after = await products.findOneOrFail({ where: { code: 'PCS/08' } });
      expect(after.sallaId).toBe(before.sallaId);
      expect(after.price).toBe(before.price);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('reports the creates and updates it would make', async () => {
      const { service } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[]);
      const summary = await service.reconcile({ dryRun: true });

      // 8 products across 3 pages; 7 match seeded SKUs, 1 is new.
      expect(summary.seen).toBe(8);
      expect(summary.created).toBe(1);
      expect(summary.updated).toBe(7);

      const created = summary.changes.find((change) => change.kind === 'created');
      expect(created?.detail).toContain('NEW/SALLA/001');
      expect(created?.detail).toMatch(/^would create/);
    });

    it('walks all three pages, including the short final one', async () => {
      const { service } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[]);
      const summary = await service.reconcile({ dryRun: true });
      // 3 + 3 + 2 — the short page proves the loop terminated on content, not
      // only on the totalPages metadata.
      expect(summary.seen).toBe(8);
    });

    it('does not fire a revalidation request for a dry run', async () => {
      const { service, revalidation } = build([...PRODUCT_LIST_PAGES] as unknown as LoosePage[]);
      await service.reconcile({ dryRun: true });
      expect(revalidation.sent).toHaveLength(0);
    });
  });

  describe('revalidation debounce', () => {
    it('fires ONCE for a whole reconcile, not once per product', async () => {
      const { service, revalidation } = build([{ data: [] }]);
      const summary = await service.reconcile({ dryRun: false });

      expect(revalidation.sent).toHaveLength(1);

      if (summary.runId) await dataSource.getRepository(SyncRun).delete({ id: summary.runId });
    });
  });
});
