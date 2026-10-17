import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuoteRequestItem } from './quote-request-item.entity';

export enum QuoteRequestStatus {
  New = 'new',
  Contacted = 'contacted',
  Quoted = 'quoted',
  Won = 'won',
  Lost = 'lost',
}

export type SiteLocale = 'ar' | 'en';

/**
 * An RFQ — the site's primary conversion. Owned entirely by us; Salla has no
 * concept of a quote request, so nothing here is ever touched by the sync.
 */
@Entity({ name: 'quote_requests' })
export class QuoteRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /**
   * Human-readable reference, e.g. "PV-2026-0001". Filled by the column
   * DEFAULT `packvio_next_quote_reference()`, which is backed by the
   * `quote_request_reference_seq` sequence (see the initial migration), so two
   * concurrent submissions can never collide the way a random string or a
   * SELECT max()+1 can. The year is the year of insert; the counter does not
   * reset annually — it is a monotonic sequence, and uniqueness, not density,
   * is what the reference has to guarantee.
   *
   * Because the value is produced by Postgres, insert code must read it back
   * (`INSERT … RETURNING reference`, or reload the entity) rather than assume
   * the in-memory object has it.
   */
  @Index('uq_quote_requests_reference', { unique: true })
  @Column({
    name: 'reference',
    type: 'varchar',
    length: 32,
    default: () => 'packvio_next_quote_reference()',
  })
  reference!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 200 })
  contactName!: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200, nullable: true })
  companyName!: string | null;

  @Index('idx_quote_requests_phone')
  @Column({ name: 'phone', type: 'varchar', length: 32 })
  phone!: string;

  @Index('idx_quote_requests_email')
  @Column({ name: 'email', type: 'varchar', length: 254 })
  email!: string;

  @Column({ name: 'city', type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ name: 'message', type: 'text', nullable: true })
  message!: string | null;

  /** Locale the request was submitted in — drives the reply email language. */
  @Column({ name: 'locale', type: 'varchar', length: 2, default: 'ar' })
  locale!: SiteLocale;

  @Index('idx_quote_requests_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: QuoteRequestStatus,
    default: QuoteRequestStatus.New,
  })
  status!: QuoteRequestStatus;

  /** Which page or component the RFQ came from, e.g. "product:PCS/08". */
  @Index('idx_quote_requests_source')
  @Column({ name: 'source', type: 'varchar', length: 120, nullable: true })
  source!: string | null;

  @Column({ name: 'needs_custom_printing', type: 'boolean', default: false })
  needsCustomPrinting!: boolean;

  @Index('idx_quote_requests_utm_source')
  @Column({ name: 'utm_source', type: 'varchar', length: 120, nullable: true })
  utmSource!: string | null;

  @Column({ name: 'utm_medium', type: 'varchar', length: 120, nullable: true })
  utmMedium!: string | null;

  @Index('idx_quote_requests_utm_campaign')
  @Column({ name: 'utm_campaign', type: 'varchar', length: 120, nullable: true })
  utmCampaign!: string | null;

  /**
   * Salted hash of the submitter's IP, never the raw address. Enough to
   * rate-limit and spot abuse, but not personal data we have to justify
   * retaining under PDPL.
   */
  @Index('idx_quote_requests_ip_hash')
  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Index('idx_quote_requests_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** When sales first replied — the SLA clock stops here. */
  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @OneToMany(() => QuoteRequestItem, (item) => item.quoteRequest, { cascade: ['insert'] })
  items!: QuoteRequestItem[];
}
