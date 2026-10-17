import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Search and read-path support for the public catalog API.
 *
 * Three things land here, none of which `migration:generate` can produce on its
 * own, because it only diffs entity metadata:
 *
 * 1. `packvio_normalize_ar(text)` — the Arabic normalisation rule, as ONE
 *    IMMUTABLE SQL function. It has to be immutable to back a generated column,
 *    and it has to be a named function (rather than an inline expression) so
 *    there is a single place the rule is defined and a single thing to change
 *    when it evolves. `apps/api/src/modules/catalog/search/arabic-normalize.ts`
 *    mirrors it character-for-character to normalise the incoming query string.
 *
 * 2. `products.name_ar_normalized` — a STORED generated column. Normalising at
 *    query time in JS would mean loading every row into Node to transform it,
 *    which no index can accelerate; normalising at write time costs nothing on a
 *    catalog that changes a few times a day and leaves something indexable.
 *
 * 3. Trigram (GIN) indexes for the substring search, and partial B-tree indexes
 *    for every filter and sort path the list endpoint exposes. The partial
 *    predicate matches the "publicly visible" clause the API always applies, so
 *    the indexes stay small and stay usable.
 *
 * The Arabic characters are written as U&'\XXXX' escapes rather than literals:
 * literal Arabic inside a translate() argument renders bidirectionally in an
 * editor and diff, which makes a character map trivially easy to misread and
 * mis-edit. The mapping, in order:
 *
 *   strip U+064B–U+065F (tashkeel), U+0670 (superscript alef), U+0640 (tatweel)
 *   U+0623 U+0625 U+0622 U+0671  (alef hamza/madda/wasla)  -> U+0627 (alef)
 *   U+0629                       (teh marbuta)             -> U+0647 (heh)
 *   U+0649                       (alef maksura)            -> U+064A (yeh)
 *   then lower(), which also folds Latin embedded in Arabic names ("PP" -> "pp")
 */
export class CatalogSearchAndReadIndexes1787049275505 implements MigrationInterface {
  name = 'CatalogSearchAndReadIndexes1787049275505';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Trigram operator classes for substring matching on an index.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.query(`
      CREATE FUNCTION "packvio_normalize_ar"(input text) RETURNS text
      LANGUAGE sql
      IMMUTABLE
      STRICT
      PARALLEL SAFE
      AS $$
        SELECT lower(
          translate(
            regexp_replace(input, '[\\u064B-\\u065F\\u0670\\u0640]', '', 'g'),
            U&'\\0623\\0625\\0622\\0671\\0629\\0649',
            U&'\\0627\\0627\\0627\\0627\\0647\\064A'
          )
        )
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "name_ar_normalized" text
      GENERATED ALWAYS AS ("packvio_normalize_ar"("name_ar")) STORED
    `);

    /**
     * TypeORM keeps generated-column expressions in its own `typeorm_metadata`
     * bookkeeping table rather than reading them back from Postgres. Without
     * this row, the next `migration:generate` sees "entity says generated, DB
     * bookkeeping says nothing", and emits a pointless drop-and-recreate of the
     * column every single time. The expression string must match the entity's
     * `asExpression` byte for byte.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_metadata" (
        "type" varchar NOT NULL,
        "database" varchar,
        "schema" varchar,
        "table" varchar,
        "name" varchar,
        "value" text
      )
    `);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      ['packvio', 'public', 'products', 'GENERATED_COLUMN', 'name_ar_normalized', 'packvio_normalize_ar(name_ar)'],
    );

    // --- substring search (LIKE '%term%' uses these) ---
    await queryRunner.query(
      `CREATE INDEX "idx_products_name_ar_normalized_trgm" ON "products" USING gin ("name_ar_normalized" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_name_en_lower_trgm" ON "products" USING gin (lower("name_en") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_code_lower_trgm" ON "products" USING gin (lower("code") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_size_lower_trgm" ON "products" USING gin (lower("size") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_material_lower_trgm" ON "products" USING gin (lower("material") gin_trgm_ops)`,
    );

    /**
     * --- sort paths ---
     *
     * Every one of these is partial on the same predicate the API's "publicly
     * visible" clause uses (`deleted_at IS NULL AND status <> 'hidden'`), so the
     * index holds only rows a public request can ever return. `id` is appended
     * as the tiebreaker the API sorts on, which keeps pagination stable across
     * pages instead of letting equal-valued rows shuffle between requests.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_products_visible_featured" ON "products" ("is_featured" DESC, "sort_order", "id")
      WHERE "deleted_at" IS NULL AND "status" <> 'hidden'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_products_visible_created" ON "products" ("created_at" DESC, "id")
      WHERE "deleted_at" IS NULL AND "status" <> 'hidden'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_products_visible_price" ON "products" ("price", "id")
      WHERE "deleted_at" IS NULL AND "status" <> 'hidden'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_products_visible_name_ar" ON "products" ("name_ar", "id")
      WHERE "deleted_at" IS NULL AND "status" <> 'hidden'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_products_visible_name_en" ON "products" ("name_en", "id")
      WHERE "deleted_at" IS NULL AND "status" <> 'hidden'
    `);

    /**
     * The category filter drives the busiest list query. The existing index is
     * on (category_id) alone; leading with category_id and carrying product_id
     * and sort_order lets the filter, the join key and the in-category ordering
     * all come from one index without touching the heap.
     */
    await queryRunner.query(
      `CREATE INDEX "idx_product_categories_category_product_sort" ON "product_categories" ("category_id", "product_id", "sort_order")`,
    );

    // Category listing sorts by sort_order over active rows only.
    await queryRunner.query(`
      CREATE INDEX "idx_categories_active_sort" ON "categories" ("sort_order", "id")
      WHERE "is_active" = true
    `);

    // Detail-page child collections are always read product-first, in order.
    await queryRunner.query(
      `CREATE INDEX "idx_product_images_product_primary_sort" ON "product_images" ("product_id", "is_primary" DESC, "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_price_tiers_product_min_quantity_asc" ON "price_tiers" ("product_id", "min_quantity" ASC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_price_tiers_product_min_quantity_asc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_product_images_product_primary_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_categories_active_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_product_categories_category_product_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_visible_name_en"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_visible_name_ar"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_visible_price"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_visible_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_visible_featured"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_material_lower_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_size_lower_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_code_lower_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_name_en_lower_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_name_ar_normalized_trgm"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'name_ar_normalized', 'packvio', 'public', 'products'],
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "name_ar_normalized"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "packvio_normalize_ar"(text)`);
    // pg_trgm is left installed on purpose: an extension is database-wide, not
    // part of this schema, and dropping it could break anything else using it.
  }
}
