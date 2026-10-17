import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../catalog/entities/product.entity';
import { QuoteRequest } from './quote-request.entity';

/** One requested line on an RFQ. */
@Entity({ name: 'quote_request_items' })
export class QuoteRequestItem {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_quote_request_items_quote_request_id')
  @Column({ name: 'quote_request_id', type: 'uuid' })
  quoteRequestId!: string;

  @ManyToOne(() => QuoteRequest, (quoteRequest) => quoteRequest.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_request_id' })
  quoteRequest!: QuoteRequest;

  /**
   * NULL is legitimate: a customer may ask for something we do not list, and a
   * catalog row that is hard-deleted later must not take the quote with it —
   * hence SET NULL rather than CASCADE.
   */
  @Index('idx_quote_request_items_product_id')
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product!: Product | null;

  /**
   * SNAPSHOT — deliberate denormalisation. A quote has to stay readable years
   * later even if the product was renamed, re-coded or deleted. Do not
   * "normalise these away" in favour of a join to products.
   */
  @Index('idx_quote_request_items_product_code_snapshot')
  @Column({ name: 'product_code_snapshot', type: 'varchar', length: 64, nullable: true })
  productCodeSnapshot!: string | null;

  /** SNAPSHOT — see productCodeSnapshot. Stored in the requester's locale. */
  @Column({ name: 'product_name_snapshot', type: 'varchar', length: 250, nullable: true })
  productNameSnapshot!: string | null;

  @Column({ name: 'quantity', type: 'int' })
  quantity!: number;

  /** Ordering unit the quantity is expressed in: "case", "piece", "carton". */
  @Column({ name: 'unit', type: 'varchar', length: 32, default: 'case' })
  unit!: string;

  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
