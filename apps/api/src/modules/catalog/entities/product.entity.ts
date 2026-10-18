import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../database/transformers/numeric.transformer';
import { PriceTier } from './price-tier.entity';
import { ProductCategory } from './product-category.entity';
import { ProductImage } from './product-image.entity';
import { ProductOption } from './product-option.entity';

export enum ProductStatus {
  Active = 'active',
  Hidden = 'hidden',
  OutOfStock = 'out_of_stock',
}

/**
 * Which conversion path a product offers on the site: the secondary cart
 * handoff to Salla, the primary RFQ, or both.
 */
export enum FulfilmentMode {
  Cart = 'cart',
  Quote = 'quote',
  Both = 'both',
}

/**
 * A catalog product.
 *
 * Sync ownership:
 *   - MIRRORED (sync may overwrite): nameEn/nameAr, short/long descriptions,
 *     size, material, caseQuantity, price, salePrice, currency, stockQuantity,
 *     isStockUnlimited, status, sallaUrl, salla* columns.
 *   - LOCAL-ONLY (sync must NEVER write): slugEn, slugAr, fulfilmentMode,
 *     isFeatured, sortOrder and every meta* column.
 *
 * `code` is the join key: Salla's product SKU field carries the same value, so
 * the sync can match a Salla product to a seeded row before any sallaId exists.
 */
@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** Salla's product id. bigint is exposed as string to avoid 2^53 truncation. */
  @Index('uq_products_salla_id', { unique: true })
  @Column({ name: 'salla_id', type: 'bigint', nullable: true })
  sallaId!: string | null;

  /** SKU, e.g. "PCS/08". Stable identity across the seed and Salla. */
  @Index('uq_products_code', { unique: true })
  @Column({ name: 'code', type: 'varchar', length: 64 })
  code!: string;

  /** Localized URL segment — LOCAL-ONLY. */
  @Index('uq_products_slug_en', { unique: true })
  @Column({ name: 'slug_en', type: 'varchar', length: 200 })
  slugEn!: string;

  /** Localized URL segment — LOCAL-ONLY. */
  @Index('uq_products_slug_ar', { unique: true })
  @Column({ name: 'slug_ar', type: 'varchar', length: 200 })
  slugAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 250 })
  nameEn!: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 250 })
  nameAr!: string;

  /**
   * `name_ar` with hamza, teh marbuta, alef maksura and tashkeel folded — see
   * the `packvio_normalize_ar` SQL function in the CatalogSearchAndReadIndexes
   * migration, which owns the rule. Maintained by Postgres as a STORED
   * generated column and backed by a GIN trigram index, so an Arabic substring
   * search is an index scan rather than a table full of per-row JS.
   *
   * Declared here so `migration:generate` knows the column exists; nothing
   * writes it, and `select: false` keeps it out of ordinary reads.
   */
  @Column({
    name: 'name_ar_normalized',
    type: 'text',
    generatedType: 'STORED',
    asExpression: 'packvio_normalize_ar(name_ar)',
    // Postgres does not put NOT NULL on a generated column; saying so here stops
    // migration:generate emitting a SET NOT NULL / DROP NOT NULL pair forever.
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  nameArNormalized!: string | null;

  @Column({ name: 'short_description_en', type: 'text', nullable: true })
  shortDescriptionEn!: string | null;

  @Column({ name: 'short_description_ar', type: 'text', nullable: true })
  shortDescriptionAr!: string | null;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn!: string | null;

  @Column({ name: 'description_ar', type: 'text', nullable: true })
  descriptionAr!: string | null;

  /** Free text from the printed catalog, e.g. "8 OZ" or "230 x 230 mm". */
  @Column({ name: 'size', type: 'varchar', length: 120, nullable: true })
  size!: string | null;

  /** Free text, e.g. "230G+18PE" or "PET". */
  @Column({ name: 'material', type: 'varchar', length: 120, nullable: true })
  material!: string | null;

  /** Units per case — the B2B ordering unit (200–6000 for most lines). */
  @Column({ name: 'case_quantity', type: 'int', nullable: true })
  caseQuantity!: number | null;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  price!: number | null;

  @Column({
    name: 'sale_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  salePrice!: number | null;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'SAR' })
  currency!: string;

  @Column({ name: 'stock_quantity', type: 'int', nullable: true })
  stockQuantity!: number | null;

  @Column({ name: 'is_stock_unlimited', type: 'boolean', default: false })
  isStockUnlimited!: boolean;

  @Index('idx_products_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.Active,
  })
  status!: ProductStatus;

  /**
   * Drives whether the product page shows Add to Cart, Request Quote, or both.
   * LOCAL-ONLY — Salla has no concept of an RFQ, so sync must never write this.
   */
  @Index('idx_products_fulfilment_mode')
  @Column({
    name: 'fulfilment_mode',
    type: 'enum',
    enum: FulfilmentMode,
    default: FulfilmentMode.Both,
  })
  fulfilmentMode!: FulfilmentMode;

  /** LOCAL-ONLY editorial flag for the home-page rail. */
  @Index('idx_products_is_featured')
  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured!: boolean;

  /**
   * Whether the buyer's logo can be printed on this product.
   *
   * LOCAL-ONLY — Salla does not model it. It is a real commercial attribute
   * (a sealing machine cannot be logo-printed; a paper cup is the whole point),
   * and the listing exposes it as a filter, so it has to be a column rather
   * than something inferred at read time from the category name.
   *
   * DEFAULT TRUE, and deliberately so: printing is what this catalog is for,
   * so the safe default is "yes" and the exceptions are enumerated. The seed
   * sets it per CATEGORY from docs/catalog.json — see the seed note. The
   * current per-category split is a first pass awaiting business sign-off.
   */
  @Index('idx_products_supports_custom_printing')
  @Column({ name: 'supports_custom_printing', type: 'boolean', default: true })
  supportsCustomPrinting!: boolean;

  /** LOCAL-ONLY ordering within a category listing. */
  @Index('idx_products_sort_order')
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  // --- variant family, LOCAL-ONLY -----------------------------------------
  //
  // The catalogue lists every colour and every size as its own SKU. That is
  // right for ordering and wrong for browsing: the Leaf Spoon filled seven
  // cards in a grid with seven near-identical tiles. These columns let the
  // LISTING collapse a family to one card while every SKU keeps its own code,
  // slug, product page and Salla identity.
  //
  // All of them are LOCAL-ONLY and derived from docs/catalog.json by
  // `scripts/derive-variants.mjs`. They are deliberately absent from
  // WRITABLE_PRODUCT_COLUMNS: Salla has no concept of this grouping, and a
  // field that merely looked like one would silently re-shuffle the grid.

  /**
   * Family key, e.g. "spoons-leaf-spoon-11-5-cm". NULL for the 41 products
   * with no siblings, which render exactly as they did before grouping.
   *
   * NO `@Index` DECORATOR, deliberately. This column is indexed — it is the
   * GROUP BY key of every listing query — but by a PARTIAL composite index
   * written out by hand in the ProductVariantGroups migration, on
   * `(variant_group, sort_order, id) WHERE variant_group IS NOT NULL AND …`.
   * TypeORM's `@Index` cannot express the predicate, so declaring one here
   * would make `migration:generate` propose dropping the real index and
   * creating a plain one, forever. It joins the ten indexes already in that
   * situation — see the CLAUDE.md note on CatalogSearchAndReadIndexes.
   */
  @Column({ name: 'variant_group', type: 'varchar', length: 160, nullable: true })
  variantGroup!: string | null;

  /** What differs across the family: 'color', 'size' or 'both'. */
  @Column({ name: 'variant_axis', type: 'varchar', length: 16, nullable: true })
  variantAxis!: string | null;

  /** What distinguishes THIS member, e.g. "Pearl" or "12 OZ Kraft". */
  @Column({ name: 'variant_label_en', type: 'varchar', length: 120, nullable: true })
  variantLabelEn!: string | null;

  @Column({ name: 'variant_label_ar', type: 'varchar', length: 120, nullable: true })
  variantLabelAr!: string | null;

  /** The family's shared name — the product name minus the variant label. */
  @Column({ name: 'variant_group_name_en', type: 'varchar', length: 250, nullable: true })
  variantGroupNameEn!: string | null;

  @Column({ name: 'variant_group_name_ar', type: 'varchar', length: 250, nullable: true })
  variantGroupNameAr!: string | null;

  /**
   * Hex swatch for the colour in this member's label, where one could be read
   * with confidence. NULL is normal — the UI falls back to the text label.
   */
  @Column({ name: 'variant_swatch', type: 'varchar', length: 9, nullable: true })
  variantSwatch!: string | null;

  /** Product page on the Salla storefront, used for the cart handoff. */
  @Column({ name: 'salla_url', type: 'text', nullable: true })
  sallaUrl!: string | null;

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

  @Column({ name: 'salla_updated_at', type: 'timestamptz', nullable: true })
  sallaUpdatedAt!: Date | null;

  @Index('idx_products_synced_at')
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt!: Date | null;

  /**
   * Soft delete: a product pulled from Salla must stay resolvable, because
   * historical quote requests still point at it.
   */
  @Index('idx_products_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductCategory, (link) => link.product)
  categoryLinks!: ProductCategory[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images!: ProductImage[];

  @OneToMany(() => ProductOption, (option) => option.product)
  options!: ProductOption[];

  @OneToMany(() => PriceTier, (tier) => tier.product)
  priceTiers!: PriceTier[];
}
