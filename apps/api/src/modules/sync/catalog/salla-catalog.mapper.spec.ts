import { ProductStatus } from '../../catalog/entities/product.entity';
import {
  CATEGORY_CREATED,
  CATEGORY_UPDATED,
  CATEGORY_UPDATED_HOSTILE,
  CATEGORY_UPDATED_INACTIVE,
  PRODUCT_CREATED,
  PRODUCT_CREATED_NEW,
  PRODUCT_UPDATED,
  PRODUCT_UPDATED_HIDDEN,
  PRODUCT_UPDATED_HOSTILE,
  PRODUCT_UPDATED_NO_PRICE,
  PRODUCT_UPDATED_OUT_OF_STOCK,
  PRODUCT_UPDATED_STALE,
} from '../../../../test/fixtures/salla';
import {
  WRITABLE_CATEGORY_COLUMNS,
  WRITABLE_PRODUCT_COLUMNS,
  isStalePayload,
  mapCategoryActive,
  mapProductStatus,
  normalizeCode,
  parseCategoryIds,
  parseImages,
  pickWritableProductColumns,
  planCategoryLinks,
  planImageReconciliation,
  productMatchKeys,
  toCategoryInsert,
  toCategoryPatch,
  toProductInsert,
  toProductPatch,
  type ProductMappingOptions,
} from './salla-catalog.mapper';

const NOW = new Date('2026-08-19T15:00:00.000Z');
const AR: ProductMappingOptions = { locale: 'ar', now: NOW };
const EN: ProductMappingOptions = { locale: 'en', now: NOW };

const data = (fixture: { data: unknown }): Record<string, unknown> =>
  fixture.data as Record<string, unknown>;

describe('SallaCatalogMapper', () => {
  describe('matching', () => {
    it('reads the SKU as the primary key and the Salla id as the fallback', () => {
      expect(productMatchKeys(data(PRODUCT_CREATED))).toEqual({
        code: 'PCS/08',
        sallaId: '445566778',
      });
    });

    it('upper-cases the code so "pcs/08" and "PCS/08" are one product', () => {
      expect(normalizeCode(' pcs/08 ')).toBe('PCS/08');
    });

    it('keeps the Salla id as a string so a bigint cannot lose precision', () => {
      const keys = productMatchKeys({ id: 9007199254740993, sku: 'X' });
      // 2^53 + 1 — the first integer a JS number cannot represent exactly. What
      // matters is that it is carried as a string, not that the literal
      // round-trips: the real defence is the bigint column.
      expect(typeof keys.sallaId).toBe('string');
    });

    it('has no code when Salla sent no SKU', () => {
      expect(productMatchKeys({ id: 1 }).code).toBeNull();
    });
  });

  describe('status mapping', () => {
    it.each([
      ['sale', ProductStatus.Active],
      ['out', ProductStatus.OutOfStock],
      ['hidden', ProductStatus.Hidden],
    ])('maps Salla %s to %s', (salla, expected) => {
      expect(mapProductStatus(salla)).toBe(expected);
    });

    it('returns null for a status it does not recognise, so the column is left alone', () => {
      // Inventing `active` here could publish something the merchant hid.
      expect(mapProductStatus('some_future_salla_status')).toBeNull();
      expect(mapProductStatus(undefined)).toBeNull();
    });

    it('maps category status to isActive and leaves unknowns alone', () => {
      expect(mapCategoryActive('active')).toBe(true);
      expect(mapCategoryActive('hidden')).toBe(false);
      expect(mapCategoryActive('who_knows')).toBeNull();
    });
  });

  describe('price', () => {
    it('reads the money-object shape and captures the currency', () => {
      const patch = toProductPatch(data(PRODUCT_CREATED), AR);
      expect(patch.price).toBe(42.5);
      expect(patch.currency).toBe('SAR');
    });

    it('reads the bare-number shape, taking currency from the top level', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED), AR);
      expect(patch.price).toBe(44);
      expect(patch.currency).toBe('SAR');
    });

    it('keeps a null price null — never 0', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED_NO_PRICE), AR);
      expect(patch.price).toBeNull();
      expect(patch.price).not.toBe(0);
    });

    it('treats a sale price of 0 as "no sale price", which is what Salla means by it', () => {
      const patch = toProductPatch(data(PRODUCT_CREATED), AR);
      expect(patch.salePrice).toBeNull();
    });

    it('keeps a real sale price', () => {
      expect(toProductPatch(data(PRODUCT_UPDATED), AR).salePrice).toBe(39.75);
    });

    it('leaves price untouched when the key is absent entirely', () => {
      const patch = toProductPatch({ id: 1, name: 'No price key' }, AR);
      expect('price' in patch).toBe(false);
    });
  });

  describe('stock and status from fixtures', () => {
    it('maps an out-of-stock product', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED_OUT_OF_STOCK), AR);
      expect(patch.status).toBe(ProductStatus.OutOfStock);
      expect(patch.stockQuantity).toBe(0);
      expect(patch.isStockUnlimited).toBe(false);
    });

    it('maps a hidden product without deleting it', () => {
      expect(toProductPatch(data(PRODUCT_UPDATED_HIDDEN), AR).status).toBe(ProductStatus.Hidden);
    });

    it('handles unlimited stock with no quantity field', () => {
      const patch = toProductPatch(data(PRODUCT_CREATED_NEW), AR);
      expect(patch.isStockUnlimited).toBe(true);
      expect('stockQuantity' in patch).toBe(false);
    });
  });

  describe('bilingual writes', () => {
    it('writes ONLY the Arabic column for an Arabic store', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED), AR);
      expect(patch.nameAr).toBe('Single Wall Coffee Cup 8 oz — Kraft');
      expect('nameEn' in patch).toBe(false);
    });

    it('writes ONLY the English column for an English store', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED), EN);
      expect(patch.nameEn).toBe('Single Wall Coffee Cup 8 oz — Kraft');
      // The whole point: a curated Arabic name is never clobbered by a sync.
      expect('nameAr' in patch).toBe(false);
    });

    it('fills BOTH name columns on insert, because they are NOT NULL', () => {
      const insert = toProductInsert(data(PRODUCT_CREATED_NEW), AR);
      expect(insert?.nameAr).toBe('Bamboo Cutlery Set');
      expect(insert?.nameEn).toBe('Bamboo Cutlery Set');
    });
  });

  describe('the writable-column allowlist', () => {
    it('drops every local-only field from a hostile payload', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED_HOSTILE), AR);

      for (const forbidden of [
        'slugEn',
        'slugAr',
        'slug',
        'isFeatured',
        'featured',
        'supportsCustomPrinting',
        'fulfilmentMode',
        'sortOrder',
        'metaTitleEn',
        'metaTitleAr',
        'metaDescriptionEn',
        'metaDescriptionAr',
        'priceTiers',
        'code',
      ]) {
        expect(patch).not.toHaveProperty(forbidden);
      }
    });

    it('still maps the mirrored fields from that same payload', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED_HOSTILE), AR);
      expect(patch.nameAr).toBe('Renamed In Salla');
      expect(patch.price).toBe(50);
      expect(patch.status).toBe(ProductStatus.Active);
    });

    it('emits nothing outside the allowlist, whatever the input', () => {
      const patch = toProductPatch(data(PRODUCT_CREATED), AR);
      for (const key of Object.keys(patch)) {
        expect(WRITABLE_PRODUCT_COLUMNS).toContain(key);
      }
    });

    it('filters unknown keys at runtime, not just at the type level', () => {
      const filtered = pickWritableProductColumns({
        nameAr: 'kept',
        isFeatured: true,
        slugEn: 'dropped',
        somethingAddedNextYear: 'dropped',
      });
      expect(filtered).toEqual({ nameAr: 'kept' });
    });

    it('excludes the local-only columns from the allowlist by name', () => {
      for (const forbidden of [
        'slugEn',
        'slugAr',
        'fulfilmentMode',
        'isFeatured',
        'supportsCustomPrinting',
        'sortOrder',
        'metaTitleEn',
        'metaTitleAr',
        'metaDescriptionEn',
        'metaDescriptionAr',
        'code',
        'size',
        'material',
        'caseQuantity',
      ]) {
        expect(WRITABLE_PRODUCT_COLUMNS).not.toContain(forbidden);
      }
    });

    it('keeps category slugs, iconKey and meta columns off the category allowlist', () => {
      for (const forbidden of [
        'slugEn',
        'slugAr',
        'iconKey',
        'metaTitleEn',
        'metaTitleAr',
        'metaDescriptionEn',
        'metaDescriptionAr',
      ]) {
        expect(WRITABLE_CATEGORY_COLUMNS).not.toContain(forbidden);
      }
    });

    it('drops local-only fields from a hostile CATEGORY payload', () => {
      const patch = toCategoryPatch(data(CATEGORY_UPDATED_HOSTILE), AR);
      for (const forbidden of ['slugEn', 'slugAr', 'iconKey', 'metaTitleEn', 'metaTitleAr']) {
        expect(patch).not.toHaveProperty(forbidden);
      }
      expect(patch.nameAr).toBe('Renamed In Salla');
    });
  });

  describe('slug immutability', () => {
    it('never proposes a slug on an update, however drastic the rename', () => {
      const patch = toProductPatch(data(PRODUCT_UPDATED_HOSTILE), AR);
      expect('slugEn' in patch).toBe(false);
      expect('slugAr' in patch).toBe(false);
    });

    it('proposes slugs ONLY on insert', () => {
      const insert = toProductInsert(data(PRODUCT_CREATED_NEW), EN);
      expect(insert?.slugEn).toBe('bamboo-cutlery-set');
      expect(insert?.slugAr).toBe('bamboo-cutlery-set');
    });

    it('synthesises a code for a Salla product with no SKU', () => {
      const insert = toProductInsert({ id: 999, name: 'No SKU Product' }, EN);
      expect(insert?.code).toBe('SALLA-999');
    });

    it('returns null for a payload with no name — an unnameable row is not insertable', () => {
      expect(toProductInsert({ id: 1, sku: 'X' }, EN)).toBeNull();
    });
  });

  describe('out-of-order protection', () => {
    const stored = new Date('2026-08-19T10:30:00+03:00');

    it('flags a payload older than the stored timestamp', () => {
      expect(isStalePayload(data(PRODUCT_UPDATED_STALE), stored)).toBe(true);
    });

    it('does not flag a payload newer than the stored timestamp', () => {
      expect(isStalePayload(data(PRODUCT_UPDATED), new Date('2026-08-19T08:00:00+03:00'))).toBe(
        false,
      );
    });

    it('does not flag an EQUAL timestamp — a redelivery of the same state is harmless', () => {
      expect(isStalePayload(data(PRODUCT_UPDATED), stored)).toBe(false);
    });

    it('never flags a payload that carries no timestamp at all', () => {
      // Dropping every delivery from an endpoint that omits updated_at would be
      // a far bigger failure than applying one update twice.
      expect(isStalePayload({ id: 1 }, stored)).toBe(false);
    });

    it('never flags anything when the row has never been synced', () => {
      expect(isStalePayload(data(PRODUCT_UPDATED_STALE), null)).toBe(false);
    });

    it('compares the Laravel object form against an ISO string correctly', () => {
      // PRODUCT_CREATED carries { date: '2026-08-19 08:00:00', timezone: 'Asia/Riyadh' },
      // which is 05:00Z — earlier than 10:30+03:00 (07:30Z), so it is stale.
      expect(isStalePayload(data(PRODUCT_CREATED), stored)).toBe(true);
    });
  });

  describe('images', () => {
    it('reads the object main_image and the gallery, marking one primary', () => {
      const images = parseImages(data(PRODUCT_CREATED));
      expect(images).toHaveLength(2);
      expect(images.filter((image) => image.isPrimary)).toHaveLength(1);
      expect(images[0]?.url).toBe('https://cdn.salla.sa/packvio/pcs08-main.jpg');
      expect(images[0]?.isPrimary).toBe(true);
      expect(images[0]?.sallaId).toBe('70001');
    });

    it('reads the bare-string main_image shape', () => {
      const images = parseImages(data(PRODUCT_UPDATED));
      const primary = images.find((image) => image.isPrimary);
      expect(primary?.url).toBe('https://cdn.salla.sa/packvio/pcs08-kraft.jpg');
    });

    it('collapses a main_image that also appears in images[] into ONE row', () => {
      const images = parseImages({
        main_image: 'https://cdn/a.jpg',
        images: [{ id: 1, url: 'https://cdn/a.jpg', sort: 0 }],
      });
      expect(images).toHaveLength(1);
      expect(images[0]?.isPrimary).toBe(true);
    });

    it('renumbers sortOrder densely from zero', () => {
      const images = parseImages({
        images: [
          { url: 'https://cdn/b.jpg', sort: 40 },
          { url: 'https://cdn/a.jpg', sort: 10 },
        ],
      });
      expect(images.map((image) => image.sortOrder)).toEqual([0, 1]);
      expect(images[0]?.url).toBe('https://cdn/a.jpg');
    });

    it('always picks exactly one primary, even when nothing is flagged', () => {
      const images = parseImages({ images: [{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }] });
      expect(images.filter((image) => image.isPrimary)).toHaveLength(1);
    });

    it('returns an empty gallery rather than throwing when there are no images', () => {
      expect(parseImages({ id: 1 })).toEqual([]);
    });

    it('plans inserts, updates and deletes by URL', () => {
      const plan = planImageReconciliation(
        [
          { id: 'row-a', sallaId: '1', url: 'https://cdn/a.jpg', sortOrder: 0, isPrimary: true },
          { id: 'row-gone', sallaId: '9', url: 'https://cdn/gone.jpg', sortOrder: 1, isPrimary: false },
        ],
        [
          { sallaId: '1', url: 'https://cdn/a.jpg', sortOrder: 1, isPrimary: false },
          { sallaId: '2', url: 'https://cdn/new.jpg', sortOrder: 0, isPrimary: true },
        ],
      );

      expect(plan.toInsert.map((image) => image.url)).toEqual(['https://cdn/new.jpg']);
      expect(plan.toUpdate.map((image) => image.id)).toEqual(['row-a']);
      expect(plan.toDeleteIds).toEqual(['row-gone']);
    });

    it('plans nothing when the gallery is unchanged', () => {
      const rows = [
        { id: 'row-a', sallaId: '1', url: 'https://cdn/a.jpg', sortOrder: 0, isPrimary: true },
      ];
      const plan = planImageReconciliation(rows, [
        { sallaId: '1', url: 'https://cdn/a.jpg', sortOrder: 0, isPrimary: true },
      ]);
      expect(plan).toEqual({ toInsert: [], toUpdate: [], toDeleteIds: [] });
    });

    it('never deletes seeded photography, however empty the Salla gallery is', () => {
      // The catalogue-card pictures the seed writes. Salla has never seen them,
      // so their absence from its payload says nothing — and at the point this
      // guard matters, no product has been photographed in Salla at all.
      const seeded = [
        {
          id: 'seed-card',
          sallaId: null,
          url: '/products/t1-2-card.webp',
          sortOrder: 0,
          isPrimary: true,
        },
        {
          id: 'seed-shot',
          sallaId: null,
          url: '/products/t1-2-shot.webp',
          sortOrder: 1,
          isPrimary: false,
        },
      ];

      expect(planImageReconciliation(seeded, []).toDeleteIds).toEqual([]);

      // And it survives alongside real Salla photography arriving later.
      const mixed = planImageReconciliation(
        [
          ...seeded,
          { id: 'salla-old', sallaId: '7', url: 'https://cdn/old.jpg', sortOrder: 2, isPrimary: false },
        ],
        [{ sallaId: '8', url: 'https://cdn/new.jpg', sortOrder: 0, isPrimary: true }],
      );
      expect(mixed.toInsert.map((image) => image.url)).toEqual(['https://cdn/new.jpg']);
      expect(mixed.toDeleteIds).toEqual(['salla-old']);
    });

    it('still deletes a Salla-sourced row that merely looks seeded', () => {
      // The guard keys on BOTH the prefix and a null sallaId, so it cannot be
      // widened into a no-op by a URL that happens to start with /products/.
      const plan = planImageReconciliation(
        [
          {
            id: 'salla-row',
            sallaId: '42',
            url: '/products/looks-seeded.webp',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
        [],
      );
      expect(plan.toDeleteIds).toEqual(['salla-row']);
    });
  });

  describe('categories', () => {
    it('reads the object shape', () => {
      expect(parseCategoryIds(data(PRODUCT_CREATED).categories)).toEqual(['301001', '301009']);
    });

    it('reads the bare-id shape', () => {
      expect(parseCategoryIds(data(PRODUCT_UPDATED).categories)).toEqual(['301001']);
    });

    it('returns an empty list for a missing categories field', () => {
      expect(parseCategoryIds(undefined)).toEqual([]);
    });

    it('plans link additions and removals', () => {
      const plan = planCategoryLinks(['cat-a', 'cat-b'], ['cat-b', 'cat-c']);
      expect(plan.toAdd).toEqual(['cat-c']);
      // Removed upstream means removed locally — see the mapper note.
      expect(plan.toRemove).toEqual(['cat-a']);
    });

    it('removes every link when Salla reports none', () => {
      expect(planCategoryLinks(['cat-a'], []).toRemove).toEqual(['cat-a']);
    });
  });

  describe('category mapping', () => {
    it('maps the created fixture, reading the object image shape', () => {
      const patch = toCategoryPatch(data(CATEGORY_CREATED), EN);
      expect(patch.nameEn).toBe('Coffee Paper Cups');
      expect(patch.imageUrl).toBe('https://cdn.salla.sa/packvio/cat-coffee-cups.jpg');
      expect(patch.sortOrder).toBe(1);
      expect(patch.isActive).toBe(true);
      expect(patch.sallaId).toBe('301001');
    });

    it('reads the bare-string image shape', () => {
      expect(toCategoryPatch(data(CATEGORY_UPDATED), EN).imageUrl).toBe(
        'https://cdn.salla.sa/packvio/cat-coffee-cups-v2.jpg',
      );
    });

    it('deactivates rather than deletes a hidden category', () => {
      expect(toCategoryPatch(data(CATEGORY_UPDATED_INACTIVE), EN).isActive).toBe(false);
    });

    it('proposes slugs for a new category only', () => {
      const insert = toCategoryInsert({ id: 1, name: 'Seasonal Packaging' }, EN);
      expect(insert?.slugEn).toBe('seasonal-packaging');
      expect('slugEn' in toCategoryPatch({ id: 1, name: 'Seasonal Packaging' }, EN)).toBe(false);
    });
  });

  describe('syncedAt', () => {
    it('stamps the injected clock rather than reading the real one', () => {
      expect(toProductPatch(data(PRODUCT_CREATED), AR).syncedAt).toBe(NOW);
    });
  });
});
