import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the Salla integration from the schema (Nov 2026: Packvio's Salla
 * package does not allow private apps, and the owner dropped Salla entirely).
 *
 * In order:
 *   1. Products and categories that came FROM Salla (a non-null `salla_id`) are
 *      taken off the site — products soft-deleted with their slugs renamed so
 *      the URLs are free again, categories hidden. In practice these are the
 *      demo-store items (dresses, skirts) a test sync brought in. Done before
 *      step 3 because `salla_id` is the only thing that identifies them.
 *   2. The three integration tables go: tokens, webhook events, sync runs.
 *   3. The Salla columns go from products, categories, images and options.
 *
 * `down()` restores the empty tables and nullable columns, so the migration
 * reverses cleanly; it cannot restore the deleted tokens or events, and the
 * hidden demo rows stay hidden.
 */
export class RemoveSallaIntegration1787400000000 implements MigrationInterface {
  name = 'RemoveSallaIntegration1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Take Salla-sourced rows off the site.
    await queryRunner.query(`
      UPDATE "products"
         SET "deleted_at" = now(),
             "is_featured" = false,
             "slug_en" = left('archived-salla-' || "id"::text || '-' || "slug_en", 200),
             "slug_ar" = left('archived-salla-' || "id"::text || '-' || "slug_ar", 200)
       WHERE "salla_id" IS NOT NULL AND "deleted_at" IS NULL`);
    await queryRunner.query(`UPDATE "categories" SET "is_active" = false WHERE "salla_id" IS NOT NULL`);

    // 2. Integration tables.
    await queryRunner.query(`DROP TABLE IF EXISTS "salla_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."salla_events_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salla_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_runs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sync_runs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sync_runs_kind_enum"`);

    // 3. Columns (their indexes go with them).
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "salla_id", DROP COLUMN "salla_url", DROP COLUMN "salla_updated_at", DROP COLUMN "synced_at"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "salla_id", DROP COLUMN "salla_updated_at", DROP COLUMN "synced_at"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN "salla_id"`);
    await queryRunner.query(`ALTER TABLE "product_options" DROP COLUMN "salla_id"`);
    await queryRunner.query(`ALTER TABLE "product_option_values" DROP COLUMN "salla_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_option_values" ADD "salla_id" bigint`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_option_values_salla_id" ON "product_option_values" ("salla_id") `);
    await queryRunner.query(`ALTER TABLE "product_options" ADD "salla_id" bigint`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_options_salla_id" ON "product_options" ("salla_id") `);
    await queryRunner.query(`ALTER TABLE "product_images" ADD "salla_id" bigint`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_images_salla_id" ON "product_images" ("salla_id") `);
    await queryRunner.query(`ALTER TABLE "categories" ADD "salla_id" bigint, ADD "salla_updated_at" TIMESTAMP WITH TIME ZONE, ADD "synced_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_salla_id" ON "categories" ("salla_id") `);
    await queryRunner.query(`CREATE INDEX "idx_categories_synced_at" ON "categories" ("synced_at") `);
    await queryRunner.query(`ALTER TABLE "products" ADD "salla_id" bigint, ADD "salla_url" text, ADD "salla_updated_at" TIMESTAMP WITH TIME ZONE, ADD "synced_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_salla_id" ON "products" ("salla_id") `);
    await queryRunner.query(`CREATE INDEX "idx_products_synced_at" ON "products" ("synced_at") `);
    await queryRunner.query(`CREATE TYPE "public"."sync_runs_kind_enum" AS ENUM('webhook', 'reconcile', 'manual')`);
    await queryRunner.query(`CREATE TYPE "public"."sync_runs_status_enum" AS ENUM('running', 'succeeded', 'partial', 'failed')`);
    await queryRunner.query(`CREATE TABLE "sync_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" "public"."sync_runs_kind_enum" NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, "entities_seen" integer NOT NULL DEFAULT '0', "entities_created" integer NOT NULL DEFAULT '0', "entities_updated" integer NOT NULL DEFAULT '0', "entities_deleted" integer NOT NULL DEFAULT '0', "status" "public"."sync_runs_status_enum" NOT NULL DEFAULT 'running', "error" text, CONSTRAINT "PK_adf13fff41a683b3b991fb90b11" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "idx_sync_runs_kind" ON "sync_runs" ("kind") `);
    await queryRunner.query(`CREATE INDEX "idx_sync_runs_started_at" ON "sync_runs" ("started_at") `);
    await queryRunner.query(`CREATE INDEX "idx_sync_runs_status" ON "sync_runs" ("status") `);
    await queryRunner.query(`CREATE INDEX "idx_sync_runs_kind_started_at" ON "sync_runs" ("kind", "started_at") `);
    await queryRunner.query(`CREATE TABLE "salla_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "store_id" bigint NOT NULL, "access_token" text NOT NULL, "refresh_token" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "scope" text, "installed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_51f414b7da926e20abe64ecd9ef" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_salla_tokens_store_id" ON "salla_tokens" ("store_id") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_tokens_expires_at" ON "salla_tokens" ("expires_at") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_tokens_revoked_at" ON "salla_tokens" ("revoked_at") `);
    await queryRunner.query(`CREATE TYPE "public"."salla_events_status_enum" AS ENUM('pending', 'processing', 'processed', 'failed', 'skipped')`);
    await queryRunner.query(`CREATE TABLE "salla_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" character varying(128) NOT NULL, "event" character varying(120) NOT NULL, "store_id" bigint, "payload" jsonb NOT NULL, "signature" character varying(256), "status" "public"."salla_events_status_enum" NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "error" text, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5528d866731b91bf575f5d2354" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_salla_events_event_id" ON "salla_events" ("event_id") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_events_event" ON "salla_events" ("event") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_events_store_id" ON "salla_events" ("store_id") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_events_received_at" ON "salla_events" ("received_at") `);
    await queryRunner.query(`CREATE INDEX "idx_salla_events_status_received_at" ON "salla_events" ("status", "received_at") `);
  }
}
