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

    it('matches every cup product for the Arabic word for cup', async () => {
      const response = await get(
        `/catalog/products?q=${encodeURIComponent(AR.cup)}&perPage=60`,
      ).expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(30);
      expect(response.body.items.map((i: { code: string }) => i.code)).toContain('PCS/08');
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

    it('counts only products the list endpoint would actually return', async () => {
      const category = await get('/catalog/categories/coffee-cups?locale=en').expect(200);
      const products = await get('/catalog/products?category=coffee-cups&perPage=60').expect(200);

      expect(category.body.productCount).toBe(products.body.total);
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
