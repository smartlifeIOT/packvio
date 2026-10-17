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
import { ProductCategory } from './product-category.entity';

/**
 * A catalog category. Mirrored from Salla where a matching Salla category
 * exists (`sallaId` set), but the seeded taxonomy from docs/catalog.json comes
 * first, so `sallaId` stays NULL until the sync links the two.
 *
 * Sync ownership:
 *   - MIRRORED (sync may overwrite): nameEn/nameAr, descriptionEn/descriptionAr,
 *     imageUrl, sortOrder, isActive, salla* columns.
 *   - LOCAL-ONLY (sync must never touch): slugEn, slugAr, iconKey and every
 *     meta* column. Slugs are URL surface — Salla renaming a category must not
 *     break our indexed URLs.
 */
@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** Salla's category id. bigint is exposed as string to avoid 2^53 truncation. */
  @Index('uq_categories_salla_id', { unique: true })
  @Column({ name: 'salla_id', type: 'bigint', nullable: true })
  sallaId!: string | null;

  @Index('idx_categories_parent_id')
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children!: Category[];

  /** Localized URL segment — LOCAL-ONLY. */
  @Index('uq_categories_slug_en', { unique: true })
  @Column({ name: 'slug_en', type: 'varchar', length: 160 })
  slugEn!: string;

  /** Localized URL segment — LOCAL-ONLY. */
  @Index('uq_categories_slug_ar', { unique: true })
  @Column({ name: 'slug_ar', type: 'varchar', length: 160 })
  slugAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 200 })
  nameAr!: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn!: string | null;

  @Column({ name: 'description_ar', type: 'text', nullable: true })
  descriptionAr!: string | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  /** Key into the front-end icon map — LOCAL-ONLY, Salla has no equivalent. */
  @Column({ name: 'icon_key', type: 'varchar', length: 64, nullable: true })
  iconKey!: string | null;

  @Index('idx_categories_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index('idx_categories_is_active')
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  // --- SEO overrides, LOCAL-ONLY ---

  @Column({ name: 'meta_title_en', type: 'varchar', length: 200, nullable: true })
  metaTitleEn!: string | null;

  @Column({ name: 'meta_title_ar', type: 'varchar', length: 200, nullable: true })
  metaTitleAr!: string | null;

  @Column({ name: 'meta_description_en', type: 'varchar', length: 320, nullable: true })
  metaDescriptionEn!: string | null;

  @Column({ name: 'meta_description_ar', type: 'varchar', length: 320, nullable: true })
  metaDescriptionAr!: string | null;

  // --- reconciliation bookkeeping ---

  /** Salla's own updated_at, so a reconcile can diff without fetching detail. */
  @Column({ name: 'salla_updated_at', type: 'timestamptz', nullable: true })
  sallaUpdatedAt!: Date | null;

  /** When our sync last wrote this row. */
  @Index('idx_categories_synced_at')
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductCategory, (link) => link.category)
  productLinks!: ProductCategory[];
}
