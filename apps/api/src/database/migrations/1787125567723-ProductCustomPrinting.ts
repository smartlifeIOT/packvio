import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `products.supports_custom_printing` — whether a buyer's logo can be
 * printed on the product. Backs the "custom printing available" filter on the
 * listing, so it has to be an indexed column rather than something inferred
 * from the category at read time.
 *
 * NOTE FOR THE NEXT PERSON: `migration:generate` also proposed dropping the ten
 * hand-written indexes from CatalogSearchAndReadIndexes (five GIN trigram, five
 * partial B-tree). Those are the documented false positives — TypeORM cannot
 * express an operator class and misreads partial-index column order, so it sees
 * a diff that is not there. They were deleted from this file by hand. The
 * `down` here is likewise only the inverse of the real change: letting the
 * generator "restore" those indexes would have recreated them with the WRONG
 * column order, which is worse than not touching them at all.
 */
export class ProductCustomPrinting1787125567723 implements MigrationInterface {
  name = 'ProductCustomPrinting1787125567723';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DEFAULT true: printing is the catalog's purpose, so the safe value for a
    // row nobody has classified yet is "yes, ask us" rather than hiding it from
    // a filter the buyer is using to find printable stock.
    await queryRunner.query(
      `ALTER TABLE "products" ADD "supports_custom_printing" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_supports_custom_printing" ON "products" ("supports_custom_printing")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_products_supports_custom_printing"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "supports_custom_printing"`);
  }
}
