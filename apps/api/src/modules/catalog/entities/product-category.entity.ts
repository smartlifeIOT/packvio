import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Product } from './product.entity';

/**
 * Explicit product↔category join: a product can sit in several categories, and
 * its position differs per category, so the link carries its own sortOrder.
 * Modelled as an entity rather than a @ManyToMany so the sync can upsert links
 * individually instead of rewriting a whole relation set.
 */
@Entity({ name: 'product_categories' })
@Unique('uq_product_categories_product_category', ['productId', 'categoryId'])
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Index('idx_product_categories_product_id')
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.categoryLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Index('idx_product_categories_category_id')
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => Category, (category) => category.productLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  /** Position of this product within this category's listing. */
  @Index('idx_product_categories_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
