import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Variant families: seven columns on `products`, all LOCAL-ONLY and all derived
 * from docs/catalog.json by `scripts/derive-variants.mjs`.
 *
 * The catalogue lists every colour and every size as its own SKU — right for
 * ordering, wrong for browsing, because the Leaf Spoon filled seven grid cards
 * with seven near-identical tiles. These columns let a LISTING collapse a
 * family to one card while every SKU keeps its own code, slug and product page.
 *
 * HAND-WRITTEN, NOT GENERATED. `migration:generate` on this schema also emits
 * DROP INDEX for the ten hand-written indexes in CatalogSearchAndReadIndexes —
 * five GIN trigram indexes whose operator class TypeORM's `@Index` cannot
 * express, and five partial B-trees whose column order it reads back wrong. See
 * the note in CLAUDE.md. Accepting a generated file here would silently degrade
 * search to a sequential scan, so the columns are written out instead.
 *
 * Every column is nullable with no default: 41 of 213 products have no
 * siblings, and NULL is their normal, permanent state.
 */
export class ProductVariantGroups1787300000000 implements MigrationInterface {
  name = 'ProductVariantGroups1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN "variant_group"         character varying(160),
        ADD COLUMN "variant_axis"          character varying(16),
        ADD COLUMN "variant_label_en"      character varying(120),
        ADD COLUMN "variant_label_ar"      character varying(120),
        ADD COLUMN "variant_group_name_en" character varying(250),
        ADD COLUMN "variant_group_name_ar" character varying(250),
        ADD COLUMN "variant_swatch"        character varying(9)
    `);

    /**
     * PARTIAL, on the same predicate the listing uses.
     *
     * `variant_group` is the GROUP BY key of every product listing, and two
     * thirds of the table shares ~45 distinct values while the other third is
     * NULL. Excluding the NULLs keeps the index to the rows that can actually
     * group, and mirrors the partial indexes already in
     * CatalogSearchAndReadIndexes — keep this predicate in step with the
     * VISIBLE constant in ProductQueryService.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_products_variant_group"
        ON "products" ("variant_group", "sort_order", "id")
        WHERE "variant_group" IS NOT NULL
          AND "deleted_at" IS NULL
          AND "status" <> 'hidden'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_variant_group"`);
    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN "variant_swatch",
        DROP COLUMN "variant_group_name_ar",
        DROP COLUMN "variant_group_name_en",
        DROP COLUMN "variant_label_ar",
        DROP COLUMN "variant_label_en",
        DROP COLUMN "variant_axis",
        DROP COLUMN "variant_group"
    `);
  }
}
