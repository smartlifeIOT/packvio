import { Injectable } from '@nestjs/common';
import type {
  CatalogCategoryDto,
  CatalogCategoryRefDto,
  CatalogImageDto,
  CatalogPriceTierDto,
  CatalogProductDetailDto,
  CatalogProductOptionDto,
  CatalogProductSummaryDto,
  CatalogSuggestionDto,
  CatalogVariantAxis,
  CatalogVariantGroupDto,
  Locale,
} from '@packvio/shared';
import { Category } from '../entities/category.entity';
import { PriceTier } from '../entities/price-tier.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductOption } from '../entities/product-option.entity';
import { Product } from '../entities/product.entity';
import type { ProductSummaryRow, SuggestionRow, VariantMemberRow } from './product-row.types';

/**
 * The single owner of entity → localized DTO conversion.
 *
 * Nothing else in the API builds a response shape. That is not tidiness for its
 * own sake: the locale contract (flatten to `name`/`slug`/`description`, always
 * emit `alternateSlug`) is exactly the kind of rule that decays when five call
 * sites each implement it, and the one field everyone forgets is `alternateSlug`
 * — which is invisible until a reader hits the language switcher on a product
 * page and lands on the home page.
 *
 * Two input shapes are handled on purpose. List queries return raw rows from a
 * hand-written single-query SELECT (see ProductQueryService), and detail queries
 * return hydrated entities. Both funnel through the same `pick`/`localize`
 * helpers, so a list card and a detail page can never disagree about what a
 * product is called.
 */
@Injectable()
export class CatalogMapperService {
  /** Resolves the pair of locale columns to (value for locale, value for the other). */
  private pick(ar: string, en: string, locale: Locale): { value: string; alternate: string } {
    return locale === 'ar' ? { value: ar, alternate: en } : { value: en, alternate: ar };
  }

  private pickNullable(ar: string | null, en: string | null, locale: Locale): string | null {
    return locale === 'ar' ? ar : en;
  }

  // --- categories --------------------------------------------------------

  toCategory(entity: Category, locale: Locale, productCount: number): CatalogCategoryDto {
    const name = this.pick(entity.nameAr, entity.nameEn, locale);
    const slug = this.pick(entity.slugAr, entity.slugEn, locale);

    return {
      id: entity.id,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
      description: this.pickNullable(entity.descriptionAr, entity.descriptionEn, locale),
      imageUrl: entity.imageUrl,
      iconKey: entity.iconKey,
      parentId: entity.parentId,
      sortOrder: entity.sortOrder,
      productCount,
    };
  }

  /**
   * Builds a category ref from loose columns — the list queries select the
   * category through a LATERAL and never hydrate a Category entity.
   */
  private toCategoryRefFromParts(
    id: string,
    nameAr: string | null,
    nameEn: string | null,
    slugAr: string | null,
    slugEn: string | null,
    locale: Locale,
  ): CatalogCategoryRefDto {
    const name = this.pick(nameAr ?? '', nameEn ?? '', locale);
    const slug = this.pick(slugAr ?? '', slugEn ?? '', locale);
    return {
      id,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
    };
  }

  /** The active linked category with the lowest sortOrder, or null. */
  private primaryCategoryOf(entity: Product, locale: Locale): CatalogCategoryRefDto | null {
    const categories = (entity.categoryLinks ?? [])
      .map((link) => link.category)
      .filter((category): category is Category => Boolean(category) && category.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    const first = categories[0];
    return first ? this.toCategoryRef(first, locale) : null;
  }

  toCategoryRef(entity: Category, locale: Locale): CatalogCategoryRefDto {
    const name = this.pick(entity.nameAr, entity.nameEn, locale);
    const slug = this.pick(entity.slugAr, entity.slugEn, locale);

    return {
      id: entity.id,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
    };
  }

  /**
   * Nests a flat, already-sorted category list under its parents.
   *
   * Any category whose parent is missing from the input is treated as a root
   * rather than silently dropped — losing a whole subtree because one parent row
   * was inactive is a much worse outcome than showing it one level too high.
   */
  toCategoryTree(flat: CatalogCategoryDto[]): CatalogCategoryDto[] {
    const byId = new Map(flat.map((category) => [category.id, { ...category, children: [] as CatalogCategoryDto[] }]));
    const roots: CatalogCategoryDto[] = [];

    for (const category of byId.values()) {
      const parent = category.parentId === null ? undefined : byId.get(category.parentId);
      if (parent) parent.children.push(category);
      else roots.push(category);
    }

    return roots;
  }

  // --- variant families --------------------------------------------------

  /**
   * Builds the variant family carried on a product payload.
   *
   * Returns null unless the product is actually in a family AND at least two
   * members survived the visibility filter. A "family" of one is a product
   * with no choices, and rendering a single chip reading "White" under a
   * product already called "… White" is noise.
   *
   * `currentId` marks which member the payload belongs to, so a card can
   * highlight the chip it is currently showing without the UI having to
   * compare ids itself.
   */
  private toVariantGroup(
    key: string | null,
    axis: string | null,
    groupNameAr: string | null,
    groupNameEn: string | null,
    members: VariantMemberRow[] | undefined,
    currentId: string,
    locale: Locale,
  ): CatalogVariantGroupDto | null {
    if (key === null || members === undefined || members.length < 2) return null;

    const name = this.pick(groupNameAr ?? '', groupNameEn ?? '', locale).value;

    return {
      key,
      axis: isVariantAxis(axis) ? axis : 'color',
      name,
      count: members.length,
      variants: members.map((member) => {
        const slug = this.pick(member.slug_ar, member.slug_en, locale);
        return {
          id: member.id,
          code: member.code,
          // Falls back to the code rather than an empty chip: a member with no
          // label is a data gap, and a blank chip is unclickable-looking where
          // a SKU at least tells the reader which one it is.
          label:
            this.pickNullable(member.variant_label_ar, member.variant_label_en, locale) ?? member.code,
          swatch: member.variant_swatch,
          slug: slug.value,
          alternateSlug: slug.alternate,
          locale,
          isCurrent: member.id === currentId,
        };
      }),
    };
  }

  // --- products ----------------------------------------------------------

  /** Maps one row of the single-query product list SELECT. */
  toProductSummary(
    row: ProductSummaryRow,
    locale: Locale,
    variantMembers?: VariantMemberRow[],
  ): CatalogProductSummaryDto {
    const name = this.pick(row.name_ar, row.name_en, locale);
    const slug = this.pick(row.slug_ar, row.slug_en, locale);

    return {
      id: row.id,
      code: row.code,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
      shortDescription: this.pickNullable(row.short_description_ar, row.short_description_en, locale),
      size: row.size,
      material: row.material,
      caseQuantity: row.case_quantity,
      price: toNumber(row.price),
      salePrice: toNumber(row.sale_price),
      currency: row.currency,
      status: row.status,
      fulfilmentMode: row.fulfilment_mode,
      isFeatured: row.is_featured,
      supportsCustomPrinting: row.supports_custom_printing,
      primaryCategory:
        row.category_id === null
          ? null
          : this.toCategoryRefFromParts(
              row.category_id,
              row.category_name_ar,
              row.category_name_en,
              row.category_slug_ar,
              row.category_slug_en,
              locale,
            ),
      primaryImage:
        row.image_id === null
          ? null
          : {
              id: row.image_id,
              url: row.image_url ?? '',
              alt: locale === 'ar' ? row.image_alt_ar : row.image_alt_en,
              isPrimary: row.image_is_primary ?? false,
              sortOrder: row.image_sort_order ?? 0,
            },
      variantGroup: this.toVariantGroup(
        row.variant_group,
        row.variant_axis,
        row.variant_group_name_ar,
        row.variant_group_name_en,
        variantMembers,
        row.id,
        locale,
      ),
    };
  }

  /** Same shape as above, but from a hydrated entity (detail and related lists). */
  toProductSummaryFromEntity(
    entity: Product,
    locale: Locale,
    variantMembers?: VariantMemberRow[],
  ): CatalogProductSummaryDto {
    const name = this.pick(entity.nameAr, entity.nameEn, locale);
    const slug = this.pick(entity.slugAr, entity.slugEn, locale);
    const images = this.toImages(entity.images ?? [], locale);

    return {
      id: entity.id,
      code: entity.code,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
      shortDescription: this.pickNullable(
        entity.shortDescriptionAr,
        entity.shortDescriptionEn,
        locale,
      ),
      size: entity.size,
      material: entity.material,
      caseQuantity: entity.caseQuantity,
      price: entity.price,
      salePrice: entity.salePrice,
      currency: entity.currency,
      status: entity.status,
      fulfilmentMode: entity.fulfilmentMode,
      isFeatured: entity.isFeatured,
      supportsCustomPrinting: entity.supportsCustomPrinting,
      /**
       * From the hydrated relation, using the same rule the SQL lateral uses:
       * the active category with the lowest sortOrder. The two paths have to
       * agree or the same product would show a different category depending on
       * whether it arrived via the list query or the detail query.
       */
      primaryCategory: this.primaryCategoryOf(entity, locale),
      primaryImage: images[0] ?? null,
      variantGroup: this.toVariantGroup(
        entity.variantGroup,
        entity.variantAxis,
        entity.variantGroupNameAr,
        entity.variantGroupNameEn,
        variantMembers,
        entity.id,
        locale,
      ),
    };
  }

  toProductDetail(
    entity: Product,
    locale: Locale,
    related: CatalogProductSummaryDto[],
    variantMembers?: VariantMemberRow[],
  ): CatalogProductDetailDto {
    const summary = this.toProductSummaryFromEntity(entity, locale, variantMembers);
    const categories = (entity.categoryLinks ?? [])
      .filter((link) => link.category !== null && link.category !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => this.toCategoryRef(link.category, locale));

    return {
      ...summary,
      description: this.pickNullable(entity.descriptionAr, entity.descriptionEn, locale),
      // The requested locale's slug is by definition the canonical one; a caller
      // that arrived on the other locale's slug compares and redirects.
      canonicalSlug: summary.slug,
      slugMatchedOtherLocale: false,
      stockQuantity: entity.stockQuantity,
      isStockUnlimited: entity.isStockUnlimited,
      sallaUrl: entity.sallaUrl,
      metaTitle: this.pickNullable(entity.metaTitleAr, entity.metaTitleEn, locale),
      metaDescription: this.pickNullable(entity.metaDescriptionAr, entity.metaDescriptionEn, locale),
      images: this.toImages(entity.images ?? [], locale),
      options: this.toOptions(entity.options ?? [], locale),
      priceTiers: this.toPriceTiers(entity.priceTiers ?? [], locale),
      categories,
      related,
    };
  }

  toSuggestion(row: SuggestionRow, locale: Locale): CatalogSuggestionDto {
    const name = this.pick(row.name_ar, row.name_en, locale);
    const slug = this.pick(row.slug_ar, row.slug_en, locale);

    return {
      id: row.id,
      name: name.value,
      slug: slug.value,
      alternateSlug: slug.alternate,
      locale,
      code: row.code,
      categoryName: locale === 'ar' ? row.category_name_ar : row.category_name_en,
      primaryImage: row.image_url,
    };
  }

  // --- child collections -------------------------------------------------

  toImages(images: ProductImage[], locale: Locale): CatalogImageDto[] {
    return [...images]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
      .map((image) => ({
        id: image.id,
        url: image.url,
        alt: locale === 'ar' ? image.altAr : image.altEn,
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
      }));
  }

  toOptions(options: ProductOption[], locale: Locale): CatalogProductOptionDto[] {
    return [...options]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        name: this.pick(option.nameAr, option.nameEn, locale).value,
        type: option.type,
        sortOrder: option.sortOrder,
        values: [...(option.values ?? [])]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((value) => ({
            id: value.id,
            value: this.pick(value.valueAr, value.valueEn, locale).value,
            priceDelta: value.priceDelta,
            sortOrder: value.sortOrder,
          })),
      }));
  }

  toPriceTiers(tiers: PriceTier[], locale: Locale): CatalogPriceTierDto[] {
    return [...tiers]
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map((tier) => ({
        id: tier.id,
        minQuantity: tier.minQuantity,
        unitPrice: tier.unitPrice,
        note: this.pickNullable(tier.noteAr, tier.noteEn, locale),
      }));
  }
}

/**
 * Postgres returns `numeric` as a string to preserve precision. The entity has a
 * transformer for that; a raw-row query bypasses entity hydration, so the same
 * conversion has to happen here.
 */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : Number(value);
}

/**
 * `variant_axis` is a plain varchar rather than a Postgres enum, so a value
 * written by hand into catalog.json could be anything. Narrow it here instead
 * of casting: the UI switches on this to label the chip row ("7 colours" vs
 * "5 sizes"), and an unexpected string would fall through every branch.
 */
function isVariantAxis(value: string | null): value is CatalogVariantAxis {
  return value === 'color' || value === 'size' || value === 'both';
}
