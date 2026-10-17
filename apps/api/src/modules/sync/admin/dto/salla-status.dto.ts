import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Operational view of the Salla connection.
 *
 * Contains no token material and never will — this is the object an operator
 * pastes into a ticket.
 */

/** The last sync of any kind, with its counters. */
export class SyncRunSummaryDto {
  @ApiProperty({ example: 'reconcile', enum: ['webhook', 'reconcile', 'manual'] })
  kind!: string;

  @ApiProperty({ example: 'succeeded', enum: ['running', 'succeeded', 'partial', 'failed'] })
  status!: string;

  @ApiProperty() startedAt!: string;
  @ApiProperty({ nullable: true }) finishedAt!: string | null;
  @ApiProperty() entitiesSeen!: number;
  @ApiProperty() entitiesCreated!: number;
  @ApiProperty() entitiesUpdated!: number;
  @ApiProperty() entitiesDeleted!: number;
  @ApiProperty({ nullable: true }) error!: string | null;
}

/**
 * A failed event, WITH its last error — the whole point of surfacing them.
 * "3 failed" tells an operator nothing they can act on; the message does.
 */
export class FailedEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'product.updated' }) event!: string;
  @ApiProperty({ nullable: true }) storeId!: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty({
    description: 'True once attempts have been exhausted — no further automatic retry.',
  })
  exhausted!: boolean;
  @ApiProperty({ nullable: true }) error!: string | null;
  @ApiProperty() receivedAt!: string;
  @ApiProperty({ nullable: true }) processedAt!: string | null;
}

export class SallaStatusDto {
  @ApiProperty() connected!: boolean;
  @ApiProperty({ nullable: true }) storeId!: string | null;
  @ApiProperty({ nullable: true }) scope!: string | null;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
  @ApiProperty({ nullable: true }) expiresInHours!: number | null;
  @ApiProperty() revoked!: boolean;
  @ApiProperty({ nullable: true }) lastEventAt!: string | null;
  @ApiProperty() pendingEvents!: number;
  @ApiProperty() failedEvents!: number;

  @ApiPropertyOptional({ type: () => SyncRunSummaryDto, nullable: true })
  lastSyncRun!: SyncRunSummaryDto | null;

  @ApiProperty({ type: () => [FailedEventDto] })
  failedEventDetails!: FailedEventDto[];

  /**
   * How much of the catalog Salla actually knows about.
   *
   * The pair is the health signal that matters on a first install: 213
   * seed-only and 0 with a Salla id means the sync has never matched anything,
   * which usually means the SKUs in Salla do not match the printed catalog's
   * codes — the one failure that silently duplicates the entire catalog.
   */
  @ApiProperty({ description: 'Products matched to a Salla product.' })
  productsWithSallaId!: number;

  @ApiProperty({ description: 'Products from the seed with no Salla counterpart yet.' })
  productsSeedOnly!: number;

  @ApiProperty({ description: 'Soft-deleted products, still resolvable for historical quotes.' })
  productsSoftDeleted!: number;
}

export class SallaRefreshResultDto {
  @ApiProperty() storeId!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() expiresInHours!: number;
}

export class EventRetryResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() event!: string;
  @ApiProperty({ description: 'Attempts so far. The retry does not reset it.' })
  attempts!: number;
  @ApiProperty({ description: 'True when the event was requeued for another attempt.' })
  requeued!: boolean;
  @ApiProperty() detail!: string;
}
