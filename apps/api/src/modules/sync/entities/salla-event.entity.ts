import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SallaEventStatus {
  Pending = 'pending',
  Processing = 'processing',
  Processed = 'processed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/**
 * Inbox for Salla webhooks. The HTTP handler only verifies the signature and
 * writes the row; a worker drains it. Storing the raw payload means a failed
 * handler can be fixed and replayed without asking Salla to resend.
 */
@Entity({ name: 'salla_events' })
@Index('idx_salla_events_status_received_at', ['status', 'receivedAt'])
export class SallaEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /**
   * Salla's own event identifier. UNIQUE is the idempotency guard: a redelivery
   * hits the constraint and is discarded instead of being processed twice.
   */
  @Index('uq_salla_events_event_id', { unique: true })
  @Column({ name: 'event_id', type: 'varchar', length: 128 })
  eventId!: string;

  /** Event name, e.g. "product.updated". */
  @Index('idx_salla_events_event')
  @Column({ name: 'event', type: 'varchar', length: 120 })
  event!: string;

  @Index('idx_salla_events_store_id')
  @Column({ name: 'store_id', type: 'bigint', nullable: true })
  storeId!: string | null;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  /** The signature header as received, kept for after-the-fact audit. */
  @Column({ name: 'signature', type: 'varchar', length: 256, nullable: true })
  signature!: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SallaEventStatus,
    default: SallaEventStatus.Pending,
  })
  status!: SallaEventStatus;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null;

  @Index('idx_salla_events_received_at')
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
