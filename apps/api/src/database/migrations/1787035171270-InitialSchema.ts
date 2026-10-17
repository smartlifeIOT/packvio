import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial schema: catalog (mirrored from Salla), leads (ours alone) and sync
 * bookkeeping.
 *
 * Three statements in up() are hand-added, because `migration:generate` only
 * diffs entity metadata and cannot see database objects an entity merely
 * references:
 *   1. CREATE EXTENSION "uuid-ossp" — every table's PK default is
 *      uuid_generate_v4(). Created here explicitly rather than relying on
 *      TypeORM's implicit connect-time bootstrap, so a migration run against a
 *      fresh database is self-sufficient. It is deliberately NOT dropped in
 *      down(): an extension is database-wide, not part of this schema.
 *   2. CREATE SEQUENCE quote_request_reference_seq
 *   3. CREATE FUNCTION packvio_next_quote_reference()
 *      — together they back the DEFAULT on quote_requests.reference, so
 *      "PV-2026-0001" is allocated atomically by Postgres. Both are dropped in
 *      down(). The function wrapper (rather than an inline expression default)
 *      keeps the stored default byte-identical to the entity metadata, so
 *      future `migration:generate` runs do not emit a phantom ALTER.
 */
export class InitialSchema1787035171270 implements MigrationInterface {
    name = 'InitialSchema1787035171270'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE SEQUENCE "quote_request_reference_seq" AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE`);
        await queryRunner.query(`CREATE FUNCTION "packvio_next_quote_reference"() RETURNS character varying LANGUAGE sql AS $$ SELECT 'PV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_request_reference_seq')::text, 4, '0') $$`);
        await queryRunner.query(`CREATE TYPE "public"."sync_runs_kind_enum" AS ENUM('webhook', 'reconcile', 'manual')`);
        await queryRunner.query(`CREATE TYPE "public"."sync_runs_status_enum" AS ENUM('running', 'succeeded', 'partial', 'failed')`);
        await queryRunner.query(`CREATE TABLE "sync_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" "public"."sync_runs_kind_enum" NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, "entities_seen" integer NOT NULL DEFAULT '0', "entities_created" integer NOT NULL DEFAULT '0', "entities_updated" integer NOT NULL DEFAULT '0', "entities_deleted" integer NOT NULL DEFAULT '0', "status" "public"."sync_runs_status_enum" NOT NULL DEFAULT 'running', "error" text, CONSTRAINT "PK_adf13fff41a683b3b991fb90b11" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sync_runs_kind" ON "sync_runs" ("kind") `);
        await queryRunner.query(`CREATE INDEX "idx_sync_runs_started_at" ON "sync_runs" ("started_at") `);
        await queryRunner.query(`CREATE INDEX "idx_sync_runs_status" ON "sync_runs" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_sync_runs_kind_started_at" ON "sync_runs" ("kind", "started_at") `);
        await queryRunner.query(`CREATE TABLE "price_tiers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "min_quantity" integer NOT NULL, "unit_price" numeric(12,2) NOT NULL, "note_en" character varying(250), "note_ar" character varying(250), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_32e26c73f31f2d3a75bb2143d62" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_price_tiers_product_id" ON "price_tiers" ("product_id") `);
        await queryRunner.query(`CREATE INDEX "idx_price_tiers_product_id_min_quantity" ON "price_tiers" ("product_id", "min_quantity") `);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salla_id" bigint, "parent_id" uuid, "slug_en" character varying(160) NOT NULL, "slug_ar" character varying(160) NOT NULL, "name_en" character varying(200) NOT NULL, "name_ar" character varying(200) NOT NULL, "description_en" text, "description_ar" text, "image_url" text, "icon_key" character varying(64), "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "meta_title_en" character varying(200), "meta_title_ar" character varying(200), "meta_description_en" character varying(320), "meta_description_ar" character varying(320), "salla_updated_at" TIMESTAMP WITH TIME ZONE, "synced_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_salla_id" ON "categories" ("salla_id") `);
        await queryRunner.query(`CREATE INDEX "idx_categories_parent_id" ON "categories" ("parent_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_slug_en" ON "categories" ("slug_en") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_slug_ar" ON "categories" ("slug_ar") `);
        await queryRunner.query(`CREATE INDEX "idx_categories_sort_order" ON "categories" ("sort_order") `);
        await queryRunner.query(`CREATE INDEX "idx_categories_is_active" ON "categories" ("is_active") `);
        await queryRunner.query(`CREATE INDEX "idx_categories_synced_at" ON "categories" ("synced_at") `);
        await queryRunner.query(`CREATE TABLE "product_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "category_id" uuid NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_product_categories_product_category" UNIQUE ("product_id", "category_id"), CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_product_categories_product_id" ON "product_categories" ("product_id") `);
        await queryRunner.query(`CREATE INDEX "idx_product_categories_category_id" ON "product_categories" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "idx_product_categories_sort_order" ON "product_categories" ("sort_order") `);
        await queryRunner.query(`CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "salla_id" bigint, "url" text NOT NULL, "alt_en" character varying(250), "alt_ar" character varying(250), "sort_order" integer NOT NULL DEFAULT '0', "is_primary" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_product_images_product_id" ON "product_images" ("product_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_images_salla_id" ON "product_images" ("salla_id") `);
        await queryRunner.query(`CREATE INDEX "idx_product_images_sort_order" ON "product_images" ("sort_order") `);
        await queryRunner.query(`CREATE INDEX "idx_product_images_is_primary" ON "product_images" ("is_primary") `);
        await queryRunner.query(`CREATE TABLE "product_option_values" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "option_id" uuid NOT NULL, "salla_id" bigint, "value_en" character varying(250) NOT NULL, "value_ar" character varying(250) NOT NULL, "price_delta" numeric(12,2) NOT NULL DEFAULT '0', "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c5ddd425048b2df1a76cb9d5226" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_product_option_values_option_id" ON "product_option_values" ("option_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_option_values_salla_id" ON "product_option_values" ("salla_id") `);
        await queryRunner.query(`CREATE INDEX "idx_product_option_values_sort_order" ON "product_option_values" ("sort_order") `);
        await queryRunner.query(`CREATE TABLE "product_options" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "salla_id" bigint, "name_en" character varying(200) NOT NULL, "name_ar" character varying(200) NOT NULL, "type" character varying(64), "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3916b02fb43aa725f8167c718e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_product_options_product_id" ON "product_options" ("product_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_product_options_salla_id" ON "product_options" ("salla_id") `);
        await queryRunner.query(`CREATE INDEX "idx_product_options_sort_order" ON "product_options" ("sort_order") `);
        await queryRunner.query(`CREATE TYPE "public"."products_status_enum" AS ENUM('active', 'hidden', 'out_of_stock')`);
        await queryRunner.query(`CREATE TYPE "public"."products_fulfilment_mode_enum" AS ENUM('cart', 'quote', 'both')`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salla_id" bigint, "code" character varying(64) NOT NULL, "slug_en" character varying(200) NOT NULL, "slug_ar" character varying(200) NOT NULL, "name_en" character varying(250) NOT NULL, "name_ar" character varying(250) NOT NULL, "short_description_en" text, "short_description_ar" text, "description_en" text, "description_ar" text, "size" character varying(120), "material" character varying(120), "case_quantity" integer, "price" numeric(12,2), "sale_price" numeric(12,2), "currency" character varying(3) NOT NULL DEFAULT 'SAR', "stock_quantity" integer, "is_stock_unlimited" boolean NOT NULL DEFAULT false, "status" "public"."products_status_enum" NOT NULL DEFAULT 'active', "fulfilment_mode" "public"."products_fulfilment_mode_enum" NOT NULL DEFAULT 'both', "is_featured" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "salla_url" text, "meta_title_en" character varying(200), "meta_title_ar" character varying(200), "meta_description_en" character varying(320), "meta_description_ar" character varying(320), "salla_updated_at" TIMESTAMP WITH TIME ZONE, "synced_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_salla_id" ON "products" ("salla_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_code" ON "products" ("code") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_slug_en" ON "products" ("slug_en") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_products_slug_ar" ON "products" ("slug_ar") `);
        await queryRunner.query(`CREATE INDEX "idx_products_status" ON "products" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_products_fulfilment_mode" ON "products" ("fulfilment_mode") `);
        await queryRunner.query(`CREATE INDEX "idx_products_is_featured" ON "products" ("is_featured") `);
        await queryRunner.query(`CREATE INDEX "idx_products_sort_order" ON "products" ("sort_order") `);
        await queryRunner.query(`CREATE INDEX "idx_products_synced_at" ON "products" ("synced_at") `);
        await queryRunner.query(`CREATE INDEX "idx_products_deleted_at" ON "products" ("deleted_at") `);
        await queryRunner.query(`CREATE TABLE "quote_request_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_request_id" uuid NOT NULL, "product_id" uuid, "product_code_snapshot" character varying(64), "product_name_snapshot" character varying(250), "quantity" integer NOT NULL, "unit" character varying(32) NOT NULL DEFAULT 'case', "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_acc856887c8eb96467419db08c5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_quote_request_items_quote_request_id" ON "quote_request_items" ("quote_request_id") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_request_items_product_id" ON "quote_request_items" ("product_id") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_request_items_product_code_snapshot" ON "quote_request_items" ("product_code_snapshot") `);
        await queryRunner.query(`CREATE TYPE "public"."quote_requests_status_enum" AS ENUM('new', 'contacted', 'quoted', 'won', 'lost')`);
        await queryRunner.query(`CREATE TABLE "quote_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" character varying(32) NOT NULL DEFAULT packvio_next_quote_reference(), "contact_name" character varying(200) NOT NULL, "company_name" character varying(200), "phone" character varying(32) NOT NULL, "email" character varying(254) NOT NULL, "city" character varying(120), "message" text, "locale" character varying(2) NOT NULL DEFAULT 'ar', "status" "public"."quote_requests_status_enum" NOT NULL DEFAULT 'new', "source" character varying(120), "needs_custom_printing" boolean NOT NULL DEFAULT false, "utm_source" character varying(120), "utm_medium" character varying(120), "utm_campaign" character varying(120), "ip_hash" character varying(64), "user_agent" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "responded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c05f72de8be0ec6b0985a851558" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_quote_requests_reference" ON "quote_requests" ("reference") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_phone" ON "quote_requests" ("phone") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_email" ON "quote_requests" ("email") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_status" ON "quote_requests" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_source" ON "quote_requests" ("source") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_utm_source" ON "quote_requests" ("utm_source") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_utm_campaign" ON "quote_requests" ("utm_campaign") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_ip_hash" ON "quote_requests" ("ip_hash") `);
        await queryRunner.query(`CREATE INDEX "idx_quote_requests_created_at" ON "quote_requests" ("created_at") `);
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
        await queryRunner.query(`ALTER TABLE "price_tiers" ADD CONSTRAINT "FK_cb6d9a590dba7489acf59a792cb" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_9148da8f26fc248e77a387e3112" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_option_values" ADD CONSTRAINT "FK_7afee5fa03c1964f983632ca474" FOREIGN KEY ("option_id") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_options" ADD CONSTRAINT "FK_49677f87ad61a8b2a31f33c8a2c" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quote_request_items" ADD CONSTRAINT "FK_88862af4ba9e9ef2b99e663ba16" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quote_request_items" ADD CONSTRAINT "FK_6d1003d0e7786c964c4624eb817" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "quote_request_items" DROP CONSTRAINT "FK_6d1003d0e7786c964c4624eb817"`);
        await queryRunner.query(`ALTER TABLE "quote_request_items" DROP CONSTRAINT "FK_88862af4ba9e9ef2b99e663ba16"`);
        await queryRunner.query(`ALTER TABLE "product_options" DROP CONSTRAINT "FK_49677f87ad61a8b2a31f33c8a2c"`);
        await queryRunner.query(`ALTER TABLE "product_option_values" DROP CONSTRAINT "FK_7afee5fa03c1964f983632ca474"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_9148da8f26fc248e77a387e3112"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`);
        await queryRunner.query(`ALTER TABLE "price_tiers" DROP CONSTRAINT "FK_cb6d9a590dba7489acf59a792cb"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_events_status_received_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_events_received_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_events_store_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_events_event"`);
        await queryRunner.query(`DROP INDEX "public"."uq_salla_events_event_id"`);
        await queryRunner.query(`DROP TABLE "salla_events"`);
        await queryRunner.query(`DROP TYPE "public"."salla_events_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_tokens_revoked_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_salla_tokens_expires_at"`);
        await queryRunner.query(`DROP INDEX "public"."uq_salla_tokens_store_id"`);
        await queryRunner.query(`DROP TABLE "salla_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_ip_hash"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_utm_campaign"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_utm_source"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_source"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_email"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_requests_phone"`);
        await queryRunner.query(`DROP INDEX "public"."uq_quote_requests_reference"`);
        await queryRunner.query(`DROP TABLE "quote_requests"`);
        await queryRunner.query(`DROP TYPE "public"."quote_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_request_items_product_code_snapshot"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_request_items_product_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_quote_request_items_quote_request_id"`);
        await queryRunner.query(`DROP TABLE "quote_request_items"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_deleted_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_synced_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_is_featured"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_fulfilment_mode"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_status"`);
        await queryRunner.query(`DROP INDEX "public"."uq_products_slug_ar"`);
        await queryRunner.query(`DROP INDEX "public"."uq_products_slug_en"`);
        await queryRunner.query(`DROP INDEX "public"."uq_products_code"`);
        await queryRunner.query(`DROP INDEX "public"."uq_products_salla_id"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TYPE "public"."products_fulfilment_mode_enum"`);
        await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_options_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."uq_product_options_salla_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_options_product_id"`);
        await queryRunner.query(`DROP TABLE "product_options"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_option_values_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."uq_product_option_values_salla_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_option_values_option_id"`);
        await queryRunner.query(`DROP TABLE "product_option_values"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_images_is_primary"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_images_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."uq_product_images_salla_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_images_product_id"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_categories_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_categories_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_product_categories_product_id"`);
        await queryRunner.query(`DROP TABLE "product_categories"`);
        await queryRunner.query(`DROP INDEX "public"."idx_categories_synced_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_categories_is_active"`);
        await queryRunner.query(`DROP INDEX "public"."idx_categories_sort_order"`);
        await queryRunner.query(`DROP INDEX "public"."uq_categories_slug_ar"`);
        await queryRunner.query(`DROP INDEX "public"."uq_categories_slug_en"`);
        await queryRunner.query(`DROP INDEX "public"."idx_categories_parent_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_categories_salla_id"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP INDEX "public"."idx_price_tiers_product_id_min_quantity"`);
        await queryRunner.query(`DROP INDEX "public"."idx_price_tiers_product_id"`);
        await queryRunner.query(`DROP TABLE "price_tiers"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sync_runs_kind_started_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sync_runs_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sync_runs_started_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sync_runs_kind"`);
        await queryRunner.query(`DROP TABLE "sync_runs"`);
        await queryRunner.query(`DROP TYPE "public"."sync_runs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."sync_runs_kind_enum"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "packvio_next_quote_reference"()`);
        await queryRunner.query(`DROP SEQUENCE IF EXISTS "quote_request_reference_seq"`);
    }

}
