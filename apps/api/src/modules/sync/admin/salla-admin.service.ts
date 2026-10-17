import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Product } from '../../catalog/entities/product.entity';
import { ReconcileService, type ReconcileSummary } from '../catalog/reconcile.service';
import { SallaApiService } from '../client/salla-api.service';
import type { SallaPingDto } from '../client/dto/salla-api.dto';
import { SallaEvent, SallaEventStatus } from '../entities/salla-event.entity';
import { SyncRun } from '../entities/sync-run.entity';
import { MAX_EVENT_ATTEMPTS, SallaEventProcessor } from '../events/salla-event-processor.service';
import { SallaTokenService } from '../token/salla-token.service';
import {
  EventRetryResultDto,
  FailedEventDto,
  SallaRefreshResultDto,
  SallaStatusDto,
  SyncRunSummaryDto,
} from './dto/salla-status.dto';

/** Failed events listed in full. Beyond this, the count is the signal. */
const FAILED_EVENT_SAMPLE = 20;

@Injectable()
export class SallaAdminService {
  private readonly logger = new Logger(SallaAdminService.name);

  constructor(
    @InjectRepository(SallaEvent) private readonly events: Repository<SallaEvent>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly tokens: SallaTokenService,
    private readonly api: SallaApiService,
    private readonly reconcileService: ReconcileService,
    private readonly processor: SallaEventProcessor,
  ) {}

  async getStatus(): Promise<SallaStatusDto> {
    const [
      token,
      latest,
      pendingEvents,
      failedEvents,
      failedDetails,
      lastRun,
      withSallaId,
      seedOnly,
      softDeleted,
    ] = await Promise.all([
      this.tokens.getStatus(),
      this.events.findOne({ where: {}, order: { receivedAt: 'DESC' }, select: ['receivedAt'] }),
      this.events.countBy({ status: SallaEventStatus.Pending }),
      this.events.countBy({ status: SallaEventStatus.Failed }),
      this.events.find({
        where: { status: SallaEventStatus.Failed },
        order: { updatedAt: 'DESC' },
        take: FAILED_EVENT_SAMPLE,
      }),
      this.runs.findOne({ where: {}, order: { startedAt: 'DESC' } }),
      this.products.count({ where: { sallaId: Not(IsNull()) } }),
      this.products.count({ where: { sallaId: IsNull() } }),
      this.products.count({ where: { deletedAt: Not(IsNull()) }, withDeleted: true }),
    ]);

    return {
      connected: token.connected,
      storeId: token.storeId,
      scope: token.scope,
      expiresAt: token.expiresAt?.toISOString() ?? null,
      expiresInHours: token.expiresInHours,
      revoked: token.revoked,
      lastEventAt: latest?.receivedAt.toISOString() ?? null,
      pendingEvents,
      failedEvents,
      lastSyncRun: lastRun ? toRunSummary(lastRun) : null,
      failedEventDetails: failedDetails.map(toFailedEvent),
      productsWithSallaId: withSallaId,
      productsSeedOnly: seedOnly,
      productsSoftDeleted: softDeleted,
    };
  }

  async refresh(): Promise<SallaRefreshResultDto> {
    const expiresAt = await this.tokens.forceRefresh();
    const storeId = (await this.tokens.getActiveStoreId()) ?? 'unknown';

    return {
      storeId,
      expiresAt: expiresAt.toISOString(),
      expiresInHours:
        Math.round(((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)) * 10) / 10,
    };
  }

  ping(): Promise<SallaPingDto> {
    return this.api.ping();
  }

  reconcile(options: { dryRun: boolean }): Promise<ReconcileSummary> {
    return this.reconcileService.reconcile(options);
  }

  /**
   * Requeues one failed event.
   *
   * `attempts` is deliberately NOT reset. A human pressing retry wants one more
   * attempt now, not a fresh budget of five — and resetting it would let a
   * permanently broken event cycle through the automatic ladder again every
   * time someone poked it. The status goes back to `pending`, which is all the
   * worker needs.
   */
  async retryEvent(id: string): Promise<EventRetryResultDto> {
    const event = await this.events.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`No Salla event with id ${id}.`);

    if (event.status === SallaEventStatus.Pending || event.status === SallaEventStatus.Processing) {
      return {
        id: event.id,
        event: event.event,
        attempts: event.attempts,
        requeued: false,
        detail: `Event is already ${event.status}; nothing to requeue.`,
      };
    }

    await this.events.update({ id: event.id }, { status: SallaEventStatus.Pending, error: null });
    this.processor.enqueue(event.id);

    this.logger.log(
      `Manually requeued Salla event ${event.event} (${event.id}) after ${event.attempts} attempt(s).`,
    );

    return {
      id: event.id,
      event: event.event,
      attempts: event.attempts,
      requeued: true,
      detail: `Requeued. Attempt ${event.attempts + 1} will run shortly.`,
    };
  }
}

function toRunSummary(run: SyncRun): SyncRunSummaryDto {
  return {
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    entitiesSeen: run.entitiesSeen,
    entitiesCreated: run.entitiesCreated,
    entitiesUpdated: run.entitiesUpdated,
    entitiesDeleted: run.entitiesDeleted,
    error: run.error,
  };
}

function toFailedEvent(event: SallaEvent): FailedEventDto {
  return {
    id: event.id,
    event: event.event,
    storeId: event.storeId,
    attempts: event.attempts,
    exhausted: event.attempts >= MAX_EVENT_ATTEMPTS,
    error: event.error,
    receivedAt: event.receivedAt.toISOString(),
    processedAt: event.processedAt?.toISOString() ?? null,
  };
}
