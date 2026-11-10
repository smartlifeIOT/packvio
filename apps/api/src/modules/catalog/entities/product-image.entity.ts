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
import { Product } from './product.entity';

/** A product gallery image, seeded from docs/product-images.json. */
@Entity({ name: 'product_images' })
export class ProductImage {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_product_images_product_id')
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'url', type: 'text' })
  url!: string;

  /** LOCAL-ONLY: alt text is accessibility copy we author. */
  @Column({ name: 'alt_en', type: 'varchar', length: 250, nullable: true })
  altEn!: string | null;

  /** LOCAL-ONLY. */
  @Column({ name: 'alt_ar', type: 'varchar', length: 250, nullable: true })
  altAr!: string | null;

  @Index('idx_product_images_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index('idx_product_images_is_primary')
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
