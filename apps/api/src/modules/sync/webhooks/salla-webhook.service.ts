import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { encryptPayloadSecrets } from '../crypto/payload-secrets';
import { SallaWebhookAckDto } from '../dto/salla-webhook-ack.dto';
import { parseWebhookEnvelope } from '../dto/salla-webhook-envelope.dto';
import { SallaEvent, SallaEventStatus } from '../entities/salla-event.entity';
import { SallaEventProcessor } from '../events/salla-event-processor.service';
import { resolveEventId } from './salla-signature';
import { extractStoreId } from './store-id';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Ingest half of the webhook path: validate, store, acknowledge. Deliberately
 * does no event processing — Salla retries anything slow, and a handler that
 * runs inline turns one slow database write into duplicate deliveries.
 */
@Injectable()
export class SallaWebhookService {
  private readonly logger = new Logger(SallaWebhookService.name);

  /** Redeliveries seen since boot. Surfaced by the admin status endpoint. */
  private duplicateCount = 0;

  constructor(
    @InjectRepository(SallaEvent) private readonly events: Repository<SallaEvent>,
    private readonly processor: SallaEventProcessor,
  ) {}

  get duplicatesSeen(): number {
    return this.duplicateCount;
  }

  async ingest(
    body: unknown,
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<SallaWebhookAckDto> {
    if (!rawBody || rawBody.length === 0) {
      // Should be unreachable — the guard rejects first — but a missing raw body
      // means the body pipeline is broken, and that must never be papered over.
      throw new BadRequestException('Raw request body is unavailable.');
    }

    const parsed = parseWebhookEnvelope(body);
    if (!parsed.ok || !parsed.envelope) {
      this.logger.warn(`Malformed Salla webhook envelope: ${parsed.errors?.join('; ') ?? 'unknown'}`);
      throw new BadRequestException('Malformed webhook envelope.');
    }

    const envelope = parsed.envelope;
    const storeId = extractStoreId(envelope.merchant, envelope.data);
    const { eventId, strategy } = resolveEventId(
      body as Record<string, unknown>,
      envelope.event,
      storeId,
      envelope.created_at ?? null,
      rawBody,
    );

    // Built as an instance rather than an object literal: TypeORM's
    // QueryDeepPartialEntity recurses into the jsonb column and cannot express
    // "any JSON object", so a literal would need a cast to typecheck.
    const row = new SallaEvent();
    row.eventId = eventId;
    row.event = envelope.event;
    row.storeId = storeId;
    row.payload = encryptPayloadSecrets(body) as Record<string, unknown>;
    row.signature = signature ?? null;
    row.status = SallaEventStatus.Pending;
    row.attempts = 0;
    row.receivedAt = new Date();
    row.processedAt = null;
    row.error = null;

    try {
      const saved = await this.events.save(row);

      const id = saved.id;
      this.logger.log(
        `Stored Salla webhook ${envelope.event} (store=${storeId ?? 'unknown'}, id key=${strategy}).`,
      );

      // Hand off and return. The processor runs on a later tick.
      this.processor.enqueue(id);

      return { received: true, duplicate: false, eventId };
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.duplicateCount += 1;
        this.logger.debug(
          `Duplicate Salla webhook ${envelope.event} (store=${storeId ?? 'unknown'}) — ` +
            `event id already stored, acknowledging without reprocessing.`,
        );
        return { received: true, duplicate: true, eventId };
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  // TypeORM does not type driverError; pg puts the SQLSTATE on `.code`.
  const driverError = error.driverError as { code?: string } | undefined;
  return driverError?.code === PG_UNIQUE_VIOLATION;
}
