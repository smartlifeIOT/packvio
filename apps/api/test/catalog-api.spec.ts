import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { configuration, ENV_FILE_PATHS } from '../src/config/configuration';
import { DatabaseModule } from '../src/database/database.module';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { describeWithDb } from './setup-db';

/**
 * End-to-end coverage of the public catalog API against the real seeded
 * database. Skipped automatically when Postgres is unreachable — see setup-db.ts
 * for why these are not written against mocks.
 */

const AR = {
  cup: 'كوب',
  cupsBare: 'اكواب',
  cupsHamza: 'أكواب',
  coffeeCupsSlug: 'اكواب-قهوة-ورقية',
  cup8Slug: 'كوب-قهوة-جدار-مفرد-8-اونصة',
};

describeWithDb('Catalog API', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: ENV_FILE_PATHS,
          load: [configuration],
        }),
        ObservabilityModule,
        DatabaseModule,
        CatalogModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts so the tests exercise the pipeline the site will hit.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    const dataSource = app.get<DataSource>(getDataSourceToken());
    if (!dataSource.isInitialized) {
      throw new Error('DataSource failed to initialize — check DATABASE_URL and migrations.');
    }

    http = request(app.getHttpServer());
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

  // --- locale contract ---------------------------------------------------

  describe('locale flattening', () => {
    it('returns different name and slug per locale but identical non-localized data', async () => {
      const ar = await get('/catalog/products/by-code/PCS%2F08?locale=ar').expect(200);
      const en = await get('/catalog/products/by-code/PCS%2F08?locale=en').expect(200);

      expect(ar.body.name).not.toBe(en.body.name);
      expect(ar.body.slug).not.toBe(en.body.slug);
      expect(ar.body.locale).toBe('ar');
      expect(en.body.locale).toBe('en');

      expect(ar.body.code).toBe(en.body.code);
      expect(ar.body.caseQuantity).toBe(en.body.caseQuantity);
      expect(ar.body.size).toBe(en.body.size);
      expect(ar.body.material).toBe(en.body.material);
    });

    it('defaults to Arabic when no locale is given', async () => {
      const response = await get('/catalog/products/by-code/PCS%2F08').expect(200);
      expect(response.body.locale).toBe('ar');
    });

    it('never exposes the per-locale column names', async () => {
      const response = await get('/catalog/products?perPage=1').expect(200);
      const item = response.body.items[0];

      for (const leaked of ['nameAr', 'nameEn', 'slugAr', 'slugEn', 'descriptionAr']) {
        expect(item).not.toHaveProperty(leaked);
      }
    });
  });

  describe('alternateSlug round-trip', () => {
    it('fetching by the ar slug returns the en slug as alternate, and vice versa', async () => {
      const ar = await get(
        `/catalog/products/${encodeURIComponent(AR.cup8Slug)}?locale=ar`,
      ).expect(200);
      const en = await get('/catalog/products/single-wall-coffee-cup-8-oz?locale=en').expect(200);

      expect(ar.body.slug).toBe(AR.cup8Slug);
      expect(ar.body.alternateSlug).toBe('single-wall-coffee-cup-8-oz');
      expect(en.body.slug).toBe('single-wall-coffee-cup-8-oz');
      expect(en.body.alternateSlug).toBe(AR.cup8Slug);

      // The two must describe the same row.
      expect(ar.body.id).toBe(en.body.id);
      expect(ar.body.code).toBe(en.body.code);
    });

    it('is present on categories, list items and related products', async () => {
      const category = await get('/catalog/categories?locale=en').expect(200);
      expect(category.body[0].alternateSlug).toBeTruthy();

      const list = await get('/catalog/products?perPage=3&locale=ar').expect(200);
      for (const item of list.body.items) expect(item.alternateSlug).toBeTruthy();

      const detail = await get('/catalog/products/by-code/PCS%2F08?locale=ar').expect(200);
      for (const related of detail.body.related) expect(related.alternateSlug).toBeTruthy();
    });
  });

  describe('cross-locale slug resolution', () => {
    it('resolves an en product slug on an ar request and reports the canonical slug', async () => {
      const response = await get('/catalog/products/single-wall-coffee-cup-8-oz?locale=ar').expect(200);

      expect(response.body.slugMatchedOtherLocale).toBe(true);
      expect(response.body.canonicalSlug).toBe(AR.cup8Slug);
      expect(response.body.slug).toBe(AR.cup8Slug);
    });

    it('resolves an ar category slug on an en request and reports the canonical slug', async () => {
      const response = await get(
        `/catalog/categories/${encodeURIComponent(AR.coffeeCupsSlug)}?locale=en`,
      ).expect(200);

      expect(response.body.slugMatchedOtherLocale).toBe(true);
      expect(response.body.canonicalSlug).toBe('coffee-cups');
      expect(response.body.name).toBe('Coffee Paper Cups');
    });

    it('does not flag a redirect when the slug already matches the locale', async () => {
      const response = await get('/catalog/categories/coffee-cups?locale=en').expect(200);

      expect(response.body.slugMatchedOtherLocale).toBe(false);
      expect(response.body.canonicalSlug).toBe(response.body.slug);
    });
  });

  // --- search ------------------------------------------------------------

  describe('Arabic search normalisation', () => {
    it('returns the same result set for the bare, hamza and trailing-space spellings', async () => {
      const [bare, hamza, spaced] = await Promise.all([
        get(`/catalog/products?q=${encodeURIComponent(AR.cupsBare)}&perPage=60`).expect(200),
        get(`/catalog/products?q=${encodeURIComponent(AR.cupsHamza)}&perPage=60`).expect(200),
        get(`/catalog/products?q=${encodeURIComponent(`${AR.cupsBare} `)}&perPage=60`).expect(200),
      ]);

      const codes = (body: { items: Array<{ code: string }> }) => body.items.map((i) => i.code);

      expect(bare.body.total).toBeGreaterThan(0);
      expect(hamza.body.total).toBe(bare.body.total);
      expect(spaced.body.total).toBe(bare.body.total);
      expect(codes(hamza.body)).toEqual(codes(bare.body));
      expect(codes(spaced.body)).toEqual(codes(bare.body));
    });

    it('matches every cup FAMILY for the Arabic word for cup', async () => {
      const response = await get(
        `/catalog/products?q=${encodeURIComponent(AR.cup)}&perPage=60`,
      ).expect(200);

      /**
       * Families, not SKUs. This asserted >= 30 before listings grouped, and
       * the same query now answers 11 — not because the search got worse but
       * because eleven families cover those thirty-odd cups, and the grid
       * shows one card each. Loosening the number without saying why would
       * hide a genuine regression later, so the real invariant is asserted
       * underneath instead: every matching SKU is still reachable, through
       * its family's variant list.
       */
      expect(response.body.total).toBeGreaterThanOrEqual(10);

      const reachable = new Set<string>();
      for (const item of response.body.items as Array<{
        code: string;
        variantGroup: { variants: Array<{ code: string }> } | null;
      }>) {
        reachable.add(item.code);
        for (const variant of item.variantGroup?.variants ?? []) reachable.add(variant.code);
      }

      // The 8 oz single-wall cup is the catalog's flagship SKU: it must be
      // findable by the bare Arabic word, whether as a card or as a variant.
      expect([...reachable]).toContain('PCS/08');
      // Grouping must not LOSE matches — the families on this page stand for
      // appreciably more SKUs than there are cards.
      expect(reachable.size).toBeGreaterThan(response.body.items.length);
    });

    it('ranks an exact SKU match first', async () => {
      const response = await get('/catalog/products?q=PCS%2F08').expect(200);

      expect(response.body.items[0].code).toBe('PCS/08');
    });

    it('searches across code, size and material as well as names', async () => {
      const byMaterial = await get('/catalog/products?q=GSM&perPage=60').expect(200);
      const bySize = await get('/catalog/products?q=OZ&perPage=60').expect(200);

      expect(byMaterial.body.total).toBeGreaterThan(0);
      expect(bySize.body.total).toBeGreaterThan(0);
    });

    it('treats LIKE wildcards as literal text', async () => {
      // Unescaped, "%" would match the entire catalog.
      const response = await get('/catalog/products?q=%25&perPage=60').expect(200);
      expect(response.body.total).toBe(0);
    });

    it('suggest applies the same normalisation', async () => {
      const [bare, hamza] = await Promise.all([
        get(`/catalog/search/suggest?q=${encodeURIComponent(AR.cupsBare)}`).expect(200),
        get(`/catalog/search/suggest?q=${encodeURIComponent(AR.cupsHamza)}`).expect(200),
      ]);

      expect(bare.body.map((s: { id: string }) => s.id)).toEqual(
        hamza.body.map((s: { id: string }) => s.id),
      );
    });
  });

  // --- lookups -----------------------------------------------------------

  describe('code lookup', () => {
    it('resolves a code containing a slash', async () => {
      const response = await get('/catalog/products/by-code/PCS%2F08').expect(200);
      expect(response.body.code).toBe('PCS/08');
    });

    it('resolves a code containing a slash and a space', async () => {
      const response = await get('/catalog/products/by-code/SBL%2F150%20OPS').expect(200);
      expect(response.body.code).toBe('SBL/150 OPS');
    });

    it('does not flag a locale redirect, because a SKU is not localized', async () => {
      const response = await get('/catalog/products/by-code/PCS%2F08?locale=en').expect(200);
      expect(response.body.slugMatchedOtherLocale).toBe(false);
    });
  });

  // --- pagination --------------------------------------------------------

  describe('pagination boundaries', () => {
    it('returns an empty page rather than an error past the last page', async () => {
      const response = await get('/catalog/products?page=999&perPage=24').expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.hasMore).toBe(false);
      expect(response.body.page).toBe(999);
    });

    it('reports hasMore correctly on the first and last page', async () => {
      const first = await get('/catalog/products?page=1&perPage=10').expect(200);
      expect(first.body.hasMore).toBe(true);

      const last = await get(`/catalog/products?page=${first.body.totalPages}&perPage=10`).expect(200);
      expect(last.body.hasMore).toBe(false);
      expect(last.body.items.length).toBeGreaterThan(0);
    });

    it('does not repeat rows between consecutive pages', async () => {
      const [one, two] = await Promise.all([
        get('/catalog/products?page=1&perPage=10').expect(200),
        get('/catalog/products?page=2&perPage=10').expect(200),
      ]);

      const ids = new Set(one.body.items.map((i: { id: string }) => i.id));
      for (const item of two.body.items) expect(ids.has(item.id)).toBe(false);
    });

    it('rejects a perPage above the cap instead of honouring it', async () => {
      await get('/catalog/products?perPage=500').expect(400);
    });
  });

  // --- error contract ----------------------------------------------------

  describe('404 shape is consistent across endpoints', () => {
    it.each([
      ['/catalog/products/no-such-slug', 'Product'],
      ['/catalog/products/by-code/NO-SUCH-CODE', 'Product'],
      ['/catalog/categories/no-such-category', 'Category'],
    ])('%s', async (path, subject) => {
      const response = await get(path).expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: expect.stringContaining(subject),
      });
    });
  });

  describe('query validation', () => {
    it('rejects an unknown query parameter', async () => {
      await get('/catalog/products?bogus=1').expect(400);
    });

    it('rejects an unsupported locale', async () => {
      await get('/catalog/products?locale=fr').expect(400);
    });

    it('parses featured=false as false, not as a truthy string', async () => {
      // enableImplicitConversion would turn "false" into true without the
      // explicit transform on the DTO.
      const [yes, no] = await Promise.all([
        get('/catalog/products?featured=true&perPage=60').expect(200),
        get('/catalog/products?featured=false&perPage=60').expect(200),
      ]);

      expect(no.body.total).toBeGreaterThan(yes.body.total);
    });
  });

  // --- other endpoints ---------------------------------------------------

  describe('variant grouping', () => {
    /**
     * The catalog lists every colour and size as its own SKU. Listings collapse
     * a family to one card; the SKUs themselves are untouched, because `code`
     * is the key the Salla sync joins on and every slug is a public URL.
     *
     * These run against the real seeded catalog rather than fixtures: the
     * grouping lives in hand-written SQL — a window function over a CTE — and a
     * mock repository would prove nothing about whether Postgres actually
     * partitions the way the TypeScript assumes.
     */
    it('shows the seven Leaf Spoon colours as ONE card', async () => {
      const response = await get('/catalog/products?category=spoons&perPage=60&locale=en').expect(200);

      const leafCards = (response.body.items as Array<{ name: string; variantGroup: null | { key: string } }>)
        .filter((item) => item.variantGroup?.key === 'spoons-leaf-spoon-11-5-cm');

      expect(leafCards).toHaveLength(1);
    });

    it('carries every sibling on that one card, with swatches', async () => {
      const response = await get('/catalog/products?category=spoons&perPage=60&locale=en').expect(200);

      const card = (response.body.items as Array<{
        variantGroup: null | {
          key: string;
          axis: string;
          name: string;
          count: number;
          variants: Array<{ code: string; label: string; swatch: string | null; slug: string; isCurrent: boolean }>;
        };
      }>).find((item) => item.variantGroup?.key === 'spoons-leaf-spoon-11-5-cm')?.variantGroup;

      expect(card).toBeDefined();
      expect(card?.axis).toBe('color');
      expect(card?.name).toBe('Leaf Spoon 11.5 cm');
      expect(card?.count).toBe(7);
      expect(card?.variants.map((v) => v.label).sort()).toEqual([
        'Blueberry', 'Bubblegum', 'Candy Green', 'Lavender', 'Lemon Grass', 'Pearl', 'Sunflower',
      ]);
      // Exactly one member is the card's own representative.
      expect(card?.variants.filter((v) => v.isCurrent)).toHaveLength(1);
      // Every colour resolved to a swatch, and every member kept its own slug.
      expect(card?.variants.every((v) => v.swatch !== null)).toBe(true);
      expect(new Set(card?.variants.map((v) => v.slug)).size).toBe(7);
    });

    it('pages over FAMILIES, so the pager does not promise cards it cannot show', async () => {
      const first = await get('/catalog/products?category=cutlery&perPage=10&locale=en').expect(200);

      // 56 SKUs in Cutlery & Tableware collapse to 31 cards.
      expect(first.body.total).toBe(31);
      expect(first.body.totalPages).toBe(4);
      expect(first.body.items).toHaveLength(10);

      // The last page must not be empty, which is what a SKU-based count would
      // have caused: 56/10 would advertise 6 pages over 31 cards.
      const last = await get('/catalog/products?category=cutlery&perPage=10&page=4&locale=en').expect(200);
      expect(last.body.items.length).toBeGreaterThan(0);
      expect(last.body.hasMore).toBe(false);
    });

    it('never repeats a family across pages', async () => {
      const seen: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const response = await get(
          `/catalog/products?category=cutlery&perPage=10&page=${page}&locale=en`,
        ).expect(200);
        for (const item of response.body.items as Array<{ id: string; variantGroup: null | { key: string } }>) {
          seen.push(item.variantGroup?.key ?? item.id);
        }
      }
      expect(seen).toHaveLength(31);
      expect(new Set(seen).size).toBe(31);
    });

    it('prefers a representative that has a photograph', async () => {
      // The family card stands in for seven products; showing the placeholder
      // while six photographed siblings sit behind it would be a worse grid
      // than the ungrouped one.
      const response = await get('/catalog/products?perPage=60&locale=en').expect(200);

      const withFamilyAndPhoto = (response.body.items as Array<{
        primaryImage: unknown;
        variantGroup: null | { variants: unknown[] };
      }>).filter((item) => item.variantGroup !== null && item.primaryImage !== null);

      expect(withFamilyAndPhoto.length).toBeGreaterThan(0);
    });

    it('keeps every variant reachable at its own URL', async () => {
      // Grouping is presentation. A buyer who was sent a link to the Lavender
      // spoon must still land on the Lavender spoon.
      const detail = await get('/catalog/products/by-code/TC-115-PS-LSPN-LVNR?locale=en').expect(200);

      expect(detail.body.code).toBe('TC-115-PS-LSPN-LVNR');
      expect(detail.body.variantGroup.count).toBe(7);
      const current = detail.body.variantGroup.variants.filter((v: { isCurrent: boolean }) => v.isCurrent);
      expect(current).toHaveLength(1);
      expect(current[0].code).toBe('TC-115-PS-LSPN-LVNR');
    });

    it('leaves a product with no siblings ungrouped', async () => {
      const detail = await get('/catalog/products/by-code/BB%2F01?locale=en').expect(200);

      expect(detail.body.code).toBe('BB/01');
      expect(detail.body.variantGroup).toBeNull();
    });
  });

  describe('categories', () => {
    it('returns active categories with product counts', async () => {
      const response = await get('/catalog/categories?locale=ar').expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].productCount).toBeGreaterThan(0);
      expect(response.body[0].children).toBeUndefined();
    });

    it('nests under ?tree=true', async () => {
      const response = await get('/catalog/categories?tree=true').expect(200);
      for (const category of response.body) expect(Array.isArray(category.children)).toBe(true);
    });

    it('counts every SKU the listing can reach, not the number of cards', async () => {
      // The tile counts SKUs and the listing counts variant FAMILIES, so these
      // two numbers are deliberately different — see the long note on
      // CategoryQueryService.productCounts for why the tile does not say
      // "1 product" in front of ten carry bags.
      //
      // What must still hold is that the tile promises nothing the listing
      // cannot deliver: every SKU in the count is reachable, either as a card
      // in its own right or inside some card's variant list. That is the
      // invariant the old `productCount === total` assertion was really after,
      // and it survives grouping where the equality does not.
      const category = await get('/catalog/categories/coffee-cups?locale=en').expect(200);
      const products = await get('/catalog/products?category=coffee-cups&perPage=60').expect(200);

      const reachable = new Set<string>();
      for (const item of products.body.items) {
        reachable.add(item.code);
        for (const variant of item.variantGroup?.variants ?? []) reachable.add(variant.code);
      }

      expect(category.body.productCount).toBe(reachable.size);
      // And grouping really is collapsing something here, or this test would
      // pass just as well with the feature switched off.
      expect(products.body.total).toBeLessThan(category.body.productCount);
    });
  });

  describe('home', () => {
    it('returns everything the home page needs in one call', async () => {
      const response = await get('/catalog/home?locale=ar').expect(200);

      expect(response.body.locale).toBe('ar');
      expect(response.body.categories.length).toBeLessThanOrEqual(8);
      expect(response.body.featured.length).toBeLessThanOrEqual(12);
      expect(response.body.newest.length).toBeLessThanOrEqual(8);
      expect(response.body.stats.productCount).toBeGreaterThan(0);
      expect(response.body.stats.categoryCount).toBeGreaterThan(0);
    });
  });

  describe('product detail', () => {
    it('carries the full payload with sorted price tiers and related products', async () => {
      const response = await get('/catalog/products/by-code/PCS%2F08?locale=ar').expect(200);

      expect(Array.isArray(response.body.images)).toBe(true);
      expect(Array.isArray(response.body.options)).toBe(true);
      expect(Array.isArray(response.body.priceTiers)).toBe(true);
      expect(Array.isArray(response.body.categories)).toBe(true);
      expect(response.body.related.length).toBeLessThanOrEqual(8);

      const quantities = response.body.priceTiers.map((t: { minQuantity: number }) => t.minQuantity);
      expect([...quantities].sort((a: number, b: number) => a - b)).toEqual(quantities);
    });

    it('never includes the product itself in its related list', async () => {
      const response = await get('/catalog/products/by-code/PCS%2F08').expect(200);
      const ids = response.body.related.map((r: { id: string }) => r.id);

      expect(ids).not.toContain(response.body.id);
    });
  });

  // --- caching -----------------------------------------------------------

  describe('caching', () => {
    it('sets Cache-Control and a strong ETag on every GET', async () => {
      const response = await get('/catalog/categories').expect(200);

      expect(response.headers['cache-control']).toBe(
        'public, max-age=60, stale-while-revalidate=300',
      );
      expect(response.headers.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
      expect(response.headers.etag).not.toMatch(/^W\//);
    });

    it('returns 304 when If-None-Match matches', async () => {
      const first = await get('/catalog/categories').expect(200);

      await get('/catalog/categories').set('If-None-Match', first.headers.etag).expect(304);
    });

    it('does not 304 across locales — the bodies differ', async () => {
      const ar = await get('/catalog/categories?locale=ar').expect(200);

      await get('/catalog/categories?locale=en').set('If-None-Match', ar.headers.etag).expect(200);
    });
  });

  // --- schema guard ------------------------------------------------------

  describe('search infrastructure', () => {
    /**
     * TypeORM cannot introspect operator classes, index column order or partial
     * predicates, so `migration:generate` proposes dropping every index the
     * catalog migration created by hand. This test is the backstop: if someone
     * accepts one of those generated drops, the suite fails here instead of the
     * search quietly degrading to a sequential scan in production.
     */
    it.each([
      'idx_products_name_ar_normalized_trgm',
      'idx_products_name_en_lower_trgm',
      'idx_products_code_lower_trgm',
      'idx_products_visible_featured',
      'idx_products_visible_created',
      'idx_product_categories_category_product_sort',
      'idx_product_images_product_primary_sort',
    ])('index %s still exists', async (indexName) => {
      const dataSource = app.get<DataSource>(getDataSourceToken());
      const rows = await dataSource.query<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [indexName],
      );

      expect(rows).toHaveLength(1);
    });

    it('keeps the SQL normaliser and the TypeScript mirror in agreement', async () => {
      // The one assertion that catches the two halves drifting apart.
      const { normalizeArabic } = await import('../src/modules/catalog/search/arabic-normalize');
      const dataSource = app.get<DataSource>(getDataSourceToken());

      const samples = ['أكواب قهوة', 'إبريق', 'آنية', 'مقلى', 'كُوْب', 'غطاء PP', 'ٱكواب'];
      const rows = await dataSource.query<Array<{ input: string; sql: string }>>(
        `SELECT s AS input, packvio_normalize_ar(s) AS sql FROM unnest($1::text[]) AS s`,
        [samples],
      );

      for (const row of rows) {
        expect(row.sql).toBe(normalizeArabic(row.input));
      }
    });
  });
});
