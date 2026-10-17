import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { SallaCatalogWriterService, type WriteResult } from '../catalog/salla-catalog-writer.service';
import { readPayloadSecret } from '../crypto/payload-secrets';
import { SallaEvent, SallaEventStatus } from '../entities/salla-event.entity';
import { SyncRun, SyncRunKind, SyncRunStatus } from '../entities/sync-run.entity';
import { RevalidationService } from '../revalidation/revalidation.service';
import { expiryFrom, SallaTokenService } from '../token/salla-token.service';
import { extractStoreId } from '../webhooks/store-id';

/** Safety valve on the boot sweep so a huge backlog cannot stall startup. */
const BOOT_SWEEP_LIMIT = 500;

/**
 * Attempts before an event is left alone for a human.
 *
 * Five, because the failures worth retrying are transient (a lock, a brief
 * Salla outage, a deploy mid-drain) and none of those last past the ~1h the
 * schedule below spans. Beyond that the failure is a bug or a bad payload, and
 * retrying it forever only buries the ones that could still succeed.
 */
export const MAX_EVENT_ATTEMPTS = 5;

/**
 * Minutes to wait before retry N. Deliberately a fixed ladder rather than
 * jittered exponential backoff: these retries are minutes apart and driven by a
 * one-minute sweep, so jitter buys nothing, and a table is something an
 * operator can read off and predict.
 */
const RETRY_DELAY_MINUTES = [1, 5, 15, 60] as const;

const PRODUCT_EVENTS = new Set(['product.created', 'product.updated', 'product.deleted']);
const CATEGORY_EVENTS = new Set(['category.created', 'category.updated', 'category.deleted']);
const APP_EVENTS = new Set(['app.store.authorize', 'app.installed', 'app.uninstalled']);

/**
 * In-process worker draining `salla_events`.
 *
 * Work is announced — by the webhook ingest after each insert, by a boot sweep,
 * and by a one-minute retry sweep — and drained one row at a time. Concurrency
 * is 1 by construction: `drain()` awaits each row before taking the next, and
 * `draining` stops a second drain starting alongside the first. That matters
 * for more than tokens now: two workers applying two `product.updated` rows for
 * the SAME product would race on the out-of-order guard and could let the
 * stale one land last.
 *
 * One drain = one BATCH = one SyncRun row and ONE revalidation request. The
 * batching is what stops a burst of fifty webhooks firing fifty cache purges.
 */
@Injectable()
export class SallaEventProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(SallaEventProcessor.name);
  private readonly queue = new Set<string>();
  private draining = false;

  constructor(
    @InjectRepository(SallaEvent) private readonly events: Repository<SallaEvent>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tokens: SallaTokenService,
    private readonly writer: SallaCatalogWriterService,
    private readonly revalidation: RevalidationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.events.find({
      where: { status: SallaEventStatus.Pending },
      order: { receivedAt: 'ASC' },
      take: BOOT_SWEEP_LIMIT,
      select: ['id'],
    });

    if (pending.length === 0) return;
    if (pending.length === BOOT_SWEEP_LIMIT) {
      this.logger.warn(
        `Boot sweep hit its ${BOOT_SWEEP_LIMIT}-row cap; older pending events will be picked up on a later run.`,
      );
    }

    this.logger.log(`Boot sweep queued ${pending.length} pending Salla event(s).`);
    for (const event of pending) this.enqueue(event.id);
  }

  /** Announce a row. Returns immediately; the work happens on a later tick. */
  enqueue(id: string): void {
    this.queue.add(id);
    if (this.draining) return;
    this.draining = true;
    setImmediate(() => {
      void this.drain();
    });
  }

  /** Exposed for tests: resolves once the queue is empty. */
  get isDraining(): boolean {
    return this.draining;
  }

  /**
   * Requeues failed events whose backoff has elapsed.
   *
   * Runs every minute rather than scheduling a timer per failure: a timer would
   * be lost on restart, which is exactly when a backlog of failures exists.
   * Reading the state back out of the table on a fixed tick survives anything.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'salla-event-retry' })
  async retryFailed(): Promise<void> {
    const now = Date.now();

    const candidates = await this.events.find({
      where: { status: SallaEventStatus.Failed, attempts: LessThan(MAX_EVENT_ATTEMPTS) },
      order: { updatedAt: 'ASC' },
      take: 100,
    });

    const due = candidates.filter((event) => {
      const waitMinutes =
        RETRY_DELAY_MINUTES[Math.min(event.attempts, RETRY_DELAY_MINUTES.length) - 1] ??
        RETRY_DELAY_MINUTES[RETRY_DELAY_MINUTES.length - 1];
      const readyAt = event.updatedAt.getTime() + waitMinutes * 60_000;
      return now >= readyAt;
    });

    if (due.length === 0) return;

    this.logger.log(`Retrying ${due.length} failed Salla event(s).`);
    for (const event of due) {
      // Back to pending so `processOne` will pick it up; `attempts` is kept, so
      // the ladder keeps climbing rather than restarting.
      await this.events.update({ id: event.id }, { status: SallaEventStatus.Pending });
      this.enqueue(event.id);
    }
  }

  private async drain(): Promise<void> {
    const batch = this.revalidation.createBatch();
    const counters = { seen: 0, created: 0, updated: 0, deleted: 0, failed: 0 };
    let run: SyncRun | null = null;

    try {
      while (this.queue.size > 0) {
        const [next] = this.queue;
        this.queue.delete(next);

        // The run row is created lazily, so a drain that turns out to have
        // nothing catalog-related to do leaves no empty audit rows behind.
        run ??= await this.runs.save(
          this.runs.create({ kind: SyncRunKind.Webhook, startedAt: new Date() }),
        );

        const result = await this.processOne(next, batch);
        counters.seen += 1;
        if (result === 'created') counters.created += 1;
        if (result === 'updated') counters.updated += 1;
        if (result === 'deleted') counters.deleted += 1;
        if (result === 'failed') counters.failed += 1;
      }
    } finally {
      this.draining = false;

      if (run) {
        run.finishedAt = new Date();
        run.entitiesSeen = counters.seen;
        run.entitiesCreated = counters.created;
        run.entitiesUpdated = counters.updated;
        run.entitiesDeleted = counters.deleted;
        run.status = counters.failed === 0 ? SyncRunStatus.Succeeded : SyncRunStatus.Partial;
        if (counters.failed > 0) run.error = `${counters.failed} event(s) failed`;
        await this.runs.save(run);

        this.logger.log(
          `Webhook drain: saw ${counters.seen}, created ${counters.created}, ` +
            `updated ${counters.updated}, deleted ${counters.deleted}, failed ${counters.failed}.`,
        );
      }

      // ONE purge for the whole batch. Never throws — see RevalidationService.
      await this.revalidation.revalidate(batch);
    }
  }

  private async processOne(
    id: string,
    batch: ReturnType<RevalidationService['createBatch']>,
  ): Promise<'created' | 'updated' | 'deleted' | 'skipped' | 'failed' | 'ignored'> {
    const event = await this.events.findOne({ where: { id } });
    if (!event) return 'ignored';
    if (event.status !== SallaEventStatus.Pending) return 'ignored';

    if (!this.isHandled(event.event)) {
      this.logger.debug(`Salla event ${event.event} is not one we mirror — marking skipped.`);
      event.status = SallaEventStatus.Skipped;
      event.processedAt = new Date();
      await this.events.save(event);
      return 'skipped';
    }

    event.status = SallaEventStatus.Processing;
    event.attempts += 1;
    await this.events.save(event);

    try {
      /**
       * ONE TRANSACTION PER EVENT. A product write touches the product row, its
       * images and its category links; a partial application would leave a
       * product carrying half a gallery, and the retry would then be diffing
       * against a state that never existed upstream.
       */
      const result = await this.dataSource.transaction((manager) =>
        this.handle(event, manager),
      );

      batch.add(result.tags);

      event.status =
        result.outcome === 'skipped' ? SallaEventStatus.Skipped : SallaEventStatus.Processed;
      event.error = null;
      event.processedAt = new Date();
      await this.events.save(event);

      this.logger.log(`Salla ${event.event}: ${result.detail}`);

      if (result.outcome === 'created') return 'created';
      if (result.outcome === 'updated') return 'updated';
      if (result.outcome === 'deleted') return 'deleted';
      return 'skipped';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      event.status = SallaEventStatus.Failed;
      event.error = message;
      event.processedAt = new Date();
      await this.events.save(event);

      const exhausted = event.attempts >= MAX_EVENT_ATTEMPTS;
      const suffix = exhausted
        ? ` — ${MAX_EVENT_ATTEMPTS} attempts exhausted, LEFT FAILED for manual retry ` +
          `(POST /api/v1/admin/salla/events/${event.id}/retry).`
        : ` — will retry (attempt ${event.attempts} of ${MAX_EVENT_ATTEMPTS}).`;

      this.logger.error(
        `Failed to process Salla event ${event.event} (store=${event.storeId ?? 'unknown'}): ${message}${suffix}`,
      );
      return 'failed';
    }
  }

  private isHandled(event: string): boolean {
    return APP_EVENTS.has(event) || PRODUCT_EVENTS.has(event) || CATEGORY_EVENTS.has(event);
  }

  private async handle(
    event: SallaEvent,
    manager: DataSource['manager'],
  ): Promise<WriteResult> {
    const data = (event.payload.data ?? {}) as Record<string, unknown>;

    switch (event.event) {
      case 'app.store.authorize':
        await this.handleAuthorize(event);
        return { outcome: 'skipped', tags: [], detail: 'stored the token pair' };
      case 'app.installed':
        this.handleInstalled(event);
        return { outcome: 'skipped', tags: [], detail: 'install acknowledged' };
      case 'app.uninstalled':
        await this.handleUninstalled(event);
        return { outcome: 'skipped', tags: [], detail: 'token revoked' };

      case 'product.created':
      case 'product.updated':
        return this.writer.upsertProduct(manager, data);
      case 'product.deleted':
        return this.writer.deleteProduct(manager, data);

      case 'category.created':
      case 'category.updated':
        return this.writer.upsertCategory(manager, data);
      case 'category.deleted':
        return this.writer.deleteCategory(manager, data);

      default:
        return { outcome: 'skipped', tags: [], detail: 'unhandled event' };
    }
  }

  /**
   * Easy Mode hands us the token pair in the webhook body. The tokens arrive
   * encrypted in `payload` (see crypto/payload-secrets) and are re-encrypted
   * under the token columns on the way into salla_tokens.
   */
  private async handleAuthorize(event: SallaEvent): Promise<void> {
    const data = (event.payload.data ?? {}) as Record<string, unknown>;
    const storeId = event.storeId ?? extractStoreId(null, data);
    if (!storeId) throw new Error('app.store.authorize carried no store id');

    const accessToken = readPayloadSecret(data.access_token);
    const refreshToken = readPayloadSecret(data.refresh_token);
    if (!accessToken || !refreshToken) {
      throw new Error('app.store.authorize carried no access/refresh token pair');
    }

    await this.tokens.storeToken({
      storeId,
      accessToken,
      refreshToken,
      expiresAt: expiryFrom({
        expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
        expires: typeof data.expires === 'number' ? data.expires : undefined,
      }),
      scope: typeof data.scope === 'string' ? data.scope : null,
    });
  }

  private handleInstalled(event: SallaEvent): void {
    this.logger.log(
      `Salla app installed on store ${event.storeId ?? 'unknown'}. ` +
        `Waiting for app.store.authorize to deliver the token pair.`,
    );
  }

  private async handleUninstalled(event: SallaEvent): Promise<void> {
    if (!event.storeId) {
      this.logger.warn('app.uninstalled carried no store id; nothing to revoke.');
      return;
    }
    await this.tokens.markRevoked(event.storeId, 'app.uninstalled webhook');
  }
}
