import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductOptionValue } from './product-option-value.entity';
import { Product } from './product.entity';

/**
 * A selectable product option (colour, lid type, print finish…). `type` is a
 * free-form string ("single-option", "color", "text"…) rather than an enum.
 */
@Entity({ name: 'product_options' })
export class ProductOption {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_product_options_product_id')
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 200 })
  nameAr!: string;

  @Column({ name: 'type', type: 'varchar', length: 64, nullable: true })
  type!: string | null;

  @Index('idx_product_options_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductOptionValue, (value) => value.option)
  values!: ProductOptionValue[];
}
