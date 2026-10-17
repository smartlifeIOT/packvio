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
import { ProductOption } from './product-option.entity';

/** One choice inside a ProductOption. Mirrored from Salla. */
@Entity({ name: 'product_option_values' })
export class ProductOptionValue {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_product_option_values_option_id')
  @Column({ name: 'option_id', type: 'uuid' })
  optionId!: string;

  @ManyToOne(() => ProductOption, (option) => option.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option!: ProductOption;

  @Index('uq_product_option_values_salla_id', { unique: true })
  @Column({ name: 'salla_id', type: 'bigint', nullable: true })
  sallaId!: string | null;

  @Column({ name: 'value_en', type: 'varchar', length: 250 })
  valueEn!: string;

  @Column({ name: 'value_ar', type: 'varchar', length: 250 })
  valueAr!: string;

  /** Amount added to the base price when this value is chosen. */
  @Column({
    name: 'price_delta',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  priceDelta!: number;

  @Index('idx_product_option_values_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
