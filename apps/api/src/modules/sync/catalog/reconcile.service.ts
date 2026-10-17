import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from '../../catalog/entities/product.entity';
import { SallaApiService } from '../client/salla-api.service';
import { SyncRun, SyncRunKind, SyncRunStatus } from '../entities/sync-run.entity';
import { RevalidationService } from '../revalidation/revalidation.service';
import { SallaCatalogWriterService } from './salla-catalog-writer.service';
import { stringifyId } from './salla-value-parsers';

/** One line of "what changed", for the log and the dry-run report. */
export interface ReconcileChange {
  kind: 'created' | 'updated' | 'deleted' | 'skipped';
  entity: 'product' | 'category';
  detail: string;
}

export interface ReconcileSummary {
  runId: string | null;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  status: SyncRunStatus;
  seen: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  /** Local products with no `sallaId` — seed-only, and never touched. */
  seedOnlyProtected: number;
  /** Capped sample of the individual changes, for a readable dry run. */
  changes: ReconcileChange[];
  error: string | null;
}

/** How many change lines a summary carries back. A full diff goes to the log. */
const MAX_REPORTED_CHANGES = 200;

@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly api: SallaApiService,
    private readonly writer: SallaCatalogWriterService,
    private readonly revalidation: RevalidationService,
  ) {}

  /**
   * Nightly full reconcile at 03:00 Asia/Riyadh.
   *
   * 03:00 local rather than UTC because the window that matters is "when the
   * merchant is asleep", and the merchant is in Riyadh. It runs for real, not
   * as a dry run: a scheduled job that only ever reports is a job nobody reads.
   */
  @Cron('0 3 * * *', { name: 'salla-nightly-reconcile', timeZone: 'Asia/Riyadh' })
  async runNightly(): Promise<void> {
    this.logger.log('Nightly Salla reconcile starting.');
    const summary = await this.reconcile({ dryRun: false });
    this.logger.log(
      `Nightly Salla reconcile ${summary.status}: saw ${summary.seen}, created ${summary.created}, ` +
        `updated ${summary.updated}, deleted ${summary.deleted}, skipped ${summary.skipped}, ` +
        `${summary.seedOnlyProtected} seed-only product(s) protected.`,
    );
  }

  /**
   * Walks the whole Salla catalog and converges Postgres onto it.
   *
   * `dryRun` performs every read and every comparison but no write, so the
   * report is what would actually happen rather than a guess. It is the DEFAULT
   * for the admin endpoint — see the controller.
   */
  async reconcile(options: { dryRun?: boolean } = {}): Promise<ReconcileSummary> {
    const dryRun = options.dryRun ?? true;
    const startedAt = new Date();
    const changes: ReconcileChange[] = [];
    const counters = { seen: 0, created: 0, updated: 0, deleted: 0, skipped: 0 };
    const batch = this.revalidation.createBatch();

    // A dry run leaves no audit row: it changed nothing, and a table full of
    // "we looked" entries makes the real runs harder to find.
    const run = dryRun
      ? null
      : await this.runs.save(
          this.runs.create({ kind: SyncRunKind.Reconcile, startedAt, status: SyncRunStatus.Running }),
        );

    let error: string | null = null;

    try {
      // Categories first, so a product's category links can resolve against a
      // category this same run may have just created.
      await this.reconcileCategories(dryRun, changes, counters, batch);
      const productIds = await this.reconcileProducts(dryRun, changes, counters, batch);
      await this.softDeleteMissing(productIds, dryRun, changes, counters, batch);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`Salla reconcile failed: ${error}`);
    }

    const seedOnly = await this.countSeedOnlyProducts();
    const finishedAt = new Date();
    const status = error
      ? SyncRunStatus.Failed
      : counters.skipped > 0
        ? SyncRunStatus.Partial
        : SyncRunStatus.Succeeded;

    if (run) {
      run.finishedAt = finishedAt;
      run.entitiesSeen = counters.seen;
      run.entitiesCreated = counters.created;
      run.entitiesUpdated = counters.updated;
      run.entitiesDeleted = counters.deleted;
      run.status = status;
      run.error = error;
      await this.runs.save(run);

      // ONE purge for the entire reconcile, however many products moved.
      await this.revalidation.revalidate(batch);
    }

    return {
      runId: run?.id ?? null,
      dryRun,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      status,
      seen: counters.seen,
      created: counters.created,
      updated: counters.updated,
      deleted: counters.deleted,
      skipped: counters.skipped,
      seedOnlyProtected: seedOnly,
      changes: changes.slice(0, MAX_REPORTED_CHANGES),
      error,
    };
  }

  /**
   * Upserts every upstream category.
   *
   * There is deliberately NO delete pass for categories. A category missing
   * upstream is handled by `category.deleted`, which deactivates it; inferring
   * a delete from absence here would risk emptying the site's navigation over a
   * paginated read that came back short.
   */
  private async reconcileCategories(
    dryRun: boolean,
    changes: ReconcileChange[],
    counters: { seen: number; created: number; updated: number; deleted: number; skipped: number },
    batch: ReturnType<RevalidationService['createBatch']>,
  ): Promise<void> {
    for await (const page of this.api.paginate((page, perPage) =>
      this.api.listCategories({ page, perPage }),
    )) {
      for (const payload of page) {
        const result = await this.dataSource.transaction((manager) =>
          this.writer.upsertCategory(manager, payload, { dryRun }),
        );

        counters.seen += 1;
        this.record(result.outcome, counters);
        batch.add(result.tags);
        if (result.outcome !== 'unchanged') {
          changes.push({
            kind: result.outcome === 'skipped' ? 'skipped' : result.outcome,
            entity: 'category',
            detail: result.detail,
          });
        }
      }
    }
  }

  /** Returns every Salla product id present upstream. */
  private async reconcileProducts(
    dryRun: boolean,
    changes: ReconcileChange[],
    counters: { seen: number; created: number; updated: number; deleted: number; skipped: number },
    batch: ReturnType<RevalidationService['createBatch']>,
  ): Promise<Set<string>> {
    const seen = new Set<string>();

    for await (const page of this.api.paginate((page, perPage) =>
      this.api.listProducts({ page, perPage }),
    )) {
      for (const payload of page) {
        const sallaId = stringifyId(payload.id);
        if (sallaId) seen.add(sallaId);

        const result = await this.dataSource.transaction((manager) =>
          this.writer.upsertProduct(manager, payload, { dryRun }),
        );

        counters.seen += 1;
        this.record(result.outcome, counters);
        batch.add(result.tags);
        if (result.outcome !== 'unchanged') {
          changes.push({
            kind: result.outcome === 'skipped' ? 'skipped' : result.outcome,
            entity: 'product',
            detail: result.detail,
          });
        }
      }
    }

    return seen;
  }

  /**
   * Soft-deletes local products that Salla no longer has.
   *
   * THE LOAD-BEARING LINE IS THE `sallaId` FILTER.
   *
   * `sallaSourcedProducts` returns only rows with a non-null `salla_id`. The
   * seeded 213 have `salla_id = NULL` — they came from the printed catalog and
   * have never existed in Salla. If this pass considered them, then the FIRST
   * reconcile against a store whose catalog has not been uploaded yet would
   * soft-delete the entire site: 213 products, every category listing empty,
   * every product URL 404. That is the single most destructive thing this
   * codebase can do, it would look like a successful run in the logs, and the
   * only recovery is a re-seed.
   *
   * So: absence from Salla is only evidence about rows that claim to come from
   * Salla. A row with no `salla_id` is making no such claim.
   *
   * A second guard sits underneath it: if the upstream catalog came back
   * completely EMPTY, nothing is deleted at all. An empty page-1 response is
   * far more likely to be an auth failure, a permissions change or an outage
   * than a merchant deleting every product at once.
   */
  private async softDeleteMissing(
    upstreamIds: Set<string>,
    dryRun: boolean,
    changes: ReconcileChange[],
    counters: { seen: number; created: number; updated: number; deleted: number; skipped: number },
    batch: ReturnType<RevalidationService['createBatch']>,
  ): Promise<void> {
    if (upstreamIds.size === 0) {
      this.logger.warn(
        'Upstream catalog came back EMPTY — skipping the delete pass entirely. An empty ' +
          'catalog is far more likely to be an auth or permissions failure than a merchant ' +
          'deleting every product, and acting on it would wipe the site.',
      );
      return;
    }

    const local = await this.writer.sallaSourcedProducts(this.dataSource.manager);

    for (const product of local) {
      if (product.deletedAt !== null) continue;
      if (product.sallaId && upstreamIds.has(product.sallaId)) continue;

      counters.deleted += 1;
      batch.add(this.writer.productTags(product));
      changes.push({
        kind: 'deleted',
        entity: 'product',
        detail: dryRun
          ? `would soft-delete ${product.code} (salla_id ${product.sallaId} absent upstream)`
          : `soft-deleted ${product.code} (salla_id ${product.sallaId} absent upstream)`,
      });

      if (!dryRun) {
        await this.dataSource.getRepository(Product).softDelete({ id: product.id });
      }
    }
  }

  /** Seed-only products: local, never in Salla, and never deletable by a sync. */
  private countSeedOnlyProducts(): Promise<number> {
    return this.dataSource
      .getRepository(Product)
      .createQueryBuilder('p')
      .where('p.salla_id IS NULL')
      .andWhere('p.deleted_at IS NULL')
      .getCount();
  }

  private record(
    outcome: string,
    counters: { created: number; updated: number; deleted: number; skipped: number },
  ): void {
    if (outcome === 'created') counters.created += 1;
    else if (outcome === 'updated') counters.updated += 1;
    else if (outcome === 'deleted') counters.deleted += 1;
    else if (outcome === 'skipped') counters.skipped += 1;
  }
}
