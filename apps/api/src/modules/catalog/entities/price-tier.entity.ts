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
import { numericTransformer } from '../../../database/transformers/numeric.transformer';
import { Product } from './product.entity';

/**
 * B2B volume pricing: "from N cases, the unit price is X".
 *
 * LOCAL-ONLY in full — Salla has no tier-pricing concept, so no salla_id here
 * and the sync must never delete or rewrite these rows.
 */
@Entity({ name: 'price_tiers' })
@Index('idx_price_tiers_product_id_min_quantity', ['productId', 'minQuantity'])
export class PriceTier {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_price_tiers_product_id')
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.priceTiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  /** Lower bound of the bracket, in the product's ordering unit (cases). */
  @Column({ name: 'min_quantity', type: 'int' })
  minQuantity!: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice!: number;

  @Column({ name: 'note_en', type: 'varchar', length: 250, nullable: true })
  noteEn!: string | null;

  @Column({ name: 'note_ar', type: 'varchar', length: 250, nullable: true })
  noteAr!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
