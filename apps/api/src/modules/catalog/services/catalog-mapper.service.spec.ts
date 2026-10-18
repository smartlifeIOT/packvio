import type { CatalogCategoryDto } from '@packvio/shared';
import { Category } from '../entities/category.entity';
import { FulfilmentMode, Product, ProductStatus } from '../entities/product.entity';
import { CatalogMapperService } from './catalog-mapper.service';
import type { ProductSummaryRow } from './product-row.types';

function buildCategory(overrides: Partial<Category> = {}): Category {
  return Object.assign(new Category(), {
    id: 'cat-1',
    slugAr: 'اكواب-قهوة-ورقية',
    slugEn: 'coffee-cups',
    nameAr: 'أكواب قهوة ورقية',
    nameEn: 'Coffee Paper Cups',
    descriptionAr: 'وصف عربي',
    descriptionEn: 'English description',
    imageUrl: null,
    iconKey: null,
    parentId: null,
    sortOrder: 1,
    ...overrides,
  });
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), {
    id: 'prod-1',
    code: 'PCS/08',
    slugAr: 'كوب-قهوة-جدار-مفرد-8-اونصة',
    slugEn: 'single-wall-coffee-cup-8-oz',
    nameAr: 'كوب قهوة جدار مفرد 8 أونصة',
    nameEn: 'Single Wall Coffee Cup 8 oz',
    shortDescriptionAr: null,
    shortDescriptionEn: null,
    descriptionAr: 'وصف',
    descriptionEn: 'Description',
    size: '8 OZ',
    material: '301 GSM Ø80',
    caseQuantity: 1000,
    price: null,
    salePrice: null,
    currency: 'SAR',
    stockQuantity: null,
    isStockUnlimited: false,
    status: ProductStatus.Active,
    fulfilmentMode: FulfilmentMode.Both,
    isFeatured: false,
    sallaUrl: null,
    metaTitleAr: null,
    metaTitleEn: null,
    metaDescriptionAr: null,
    metaDescriptionEn: null,
    images: [],
    options: [],
    priceTiers: [],
    categoryLinks: [],
    ...overrides,
  });
}

describe('CatalogMapperService', () => {
  const mapper = new CatalogMapperService();

  describe('locale flattening', () => {
    it('returns different name and slug per locale, and identical non-localized data', () => {
      const product = buildProduct();

      const ar = mapper.toProductSummaryFromEntity(product, 'ar');
      const en = mapper.toProductSummaryFromEntity(product, 'en');

      expect(ar.name).not.toBe(en.name);
      expect(ar.slug).not.toBe(en.slug);
      expect(ar.name).toBe('كوب قهوة جدار مفرد 8 أونصة');
      expect(en.name).toBe('Single Wall Coffee Cup 8 oz');

      // Non-localized fields must be byte-identical across locales.
      expect(ar.code).toBe(en.code);
      expect(ar.caseQuantity).toBe(en.caseQuantity);
      expect(ar.size).toBe(en.size);
      expect(ar.material).toBe(en.material);
      expect(ar.currency).toBe(en.currency);
    });

    it('never leaks the per-locale column names into the response', () => {
      const summary = mapper.toProductSummaryFromEntity(buildProduct(), 'ar');

      expect(summary).not.toHaveProperty('nameAr');
      expect(summary).not.toHaveProperty('nameEn');
      expect(summary).not.toHaveProperty('slugAr');
      expect(summary).not.toHaveProperty('slugEn');
    });
  });

  describe('alternateSlug', () => {
    it('round-trips: each locale reports the other locale\'s slug', () => {
      const product = buildProduct();

      const ar = mapper.toProductSummaryFromEntity(product, 'ar');
      const en = mapper.toProductSummaryFromEntity(product, 'en');

      expect(ar.alternateSlug).toBe(en.slug);
      expect(en.alternateSlug).toBe(ar.slug);
    });

    it('is present on categories too', () => {
      const ar = mapper.toCategory(buildCategory(), 'ar', 3);
      const en = mapper.toCategory(buildCategory(), 'en', 3);

      expect(ar.slug).toBe('اكواب-قهوة-ورقية');
      expect(ar.alternateSlug).toBe('coffee-cups');
      expect(en.alternateSlug).toBe(ar.slug);
    });
  });

  describe('toCategoryTree', () => {
    const flat = (id: string, parentId: string | null): CatalogCategoryDto => ({
      id,
      parentId,
      name: id,
      slug: id,
      alternateSlug: `${id}-en`,
      locale: 'ar',
      description: null,
      imageUrl: null,
      iconKey: null,
      sortOrder: 0,
      productCount: 0,
    });

    it('nests children under their parent', () => {
      const tree = mapper.toCategoryTree([flat('root', null), flat('child', 'root')]);

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('root');
      expect(tree[0]?.children?.map((c) => c.id)).toEqual(['child']);
    });

    it('promotes an orphan to a root rather than dropping it', () => {
      // Losing a whole subtree because one parent row went inactive is worse
      // than showing it one level too high.
      const tree = mapper.toCategoryTree([flat('orphan', 'missing-parent')]);

      expect(tree.map((c) => c.id)).toEqual(['orphan']);
    });
  });

  describe('raw row mapping', () => {
    const row: ProductSummaryRow = {
      id: 'prod-1',
      code: 'PCS/08',
      slug_ar: 'كوب-8',
      slug_en: 'cup-8',
      name_ar: 'كوب',
      name_en: 'Cup',
      short_description_ar: null,
      short_description_en: null,
      size: '8 OZ',
      material: null,
      case_quantity: 1000,
      price: '42.50',
      sale_price: null,
      currency: 'SAR',
      status: 'active',
      fulfilment_mode: 'both',
      is_featured: false,
      supports_custom_printing: true,
      variant_group: null,
      variant_axis: null,
      variant_label_ar: null,
      variant_label_en: null,
      variant_group_name_ar: null,
      variant_group_name_en: null,
      variant_swatch: null,
      category_id: 'cat-1',
      category_name_ar: 'أكواب قهوة ورقية',
      category_name_en: 'Coffee Paper Cups',
      category_slug_ar: 'اكواب-قهوة-ورقية',
      category_slug_en: 'coffee-cups',
      image_id: null,
      image_url: null,
      image_alt_ar: null,
      image_alt_en: null,
      image_is_primary: null,
      image_sort_order: null,
    };

    it('converts pg numeric strings to numbers', () => {
      // pg returns numeric as a string to protect precision; a JSON price that
      // arrives as "42.50" breaks every arithmetic op on the frontend.
      const summary = mapper.toProductSummary(row, 'ar');

      expect(summary.price).toBe(42.5);
      expect(typeof summary.price).toBe('number');
      expect(summary.salePrice).toBeNull();
    });

    it('maps a null lateral-join image to null rather than an empty object', () => {
      expect(mapper.toProductSummary(row, 'ar').primaryImage).toBeNull();
    });

    it('builds the image when the lateral join found one', () => {
      const summary = mapper.toProductSummary(
        { ...row, image_id: 'img-1', image_url: 'https://cdn/x.jpg', image_alt_ar: 'صورة', image_is_primary: true, image_sort_order: 0 },
        'ar',
      );

      expect(summary.primaryImage).toEqual({
        id: 'img-1',
        url: 'https://cdn/x.jpg',
        alt: 'صورة',
        isPrimary: true,
        sortOrder: 0,
      });
    });
  });

  describe('child collections', () => {
    it('sorts price tiers ascending by minQuantity', () => {
      const product = buildProduct({
        priceTiers: [
          { id: 't2', minQuantity: 50, unitPrice: 9, noteAr: null, noteEn: null },
          { id: 't1', minQuantity: 10, unitPrice: 12, noteAr: null, noteEn: null },
          { id: 't3', minQuantity: 100, unitPrice: 7, noteAr: null, noteEn: null },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, only the fields the mapper reads
        ] as any,
      });

      const detail = mapper.toProductDetail(product, 'ar', []);
      expect(detail.priceTiers.map((t) => t.minQuantity)).toEqual([10, 50, 100]);
    });

    it('puts the primary image first regardless of stored order', () => {
      const product = buildProduct({
        images: [
          { id: 'b', url: 'b', altAr: null, altEn: null, isPrimary: false, sortOrder: 0 },
          { id: 'a', url: 'a', altAr: null, altEn: null, isPrimary: true, sortOrder: 5 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, only the fields the mapper reads
        ] as any,
      });

      const detail = mapper.toProductDetail(product, 'en', []);
      expect(detail.images.map((i) => i.id)).toEqual(['a', 'b']);
      expect(detail.primaryImage?.id).toBe('a');
    });
  });
});
