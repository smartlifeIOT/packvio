import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CatalogCategoryDetailDto,
  CatalogCategoryDto,
  CatalogCategoryRefDto,
  CatalogErrorDto,
  CatalogFulfilmentMode,
  CatalogHomeDto,
  CatalogImageDto,
  CatalogPriceTierDto,
  CatalogProductDetailDto,
  CatalogProductOptionDto,
  CatalogProductOptionValueDto,
  CatalogProductStatus,
  CatalogProductSummaryDto,
  CatalogStatsDto,
  CatalogSuggestionDto,
  CatalogVariantAxis,
  CatalogVariantGroupDto,
  CatalogVariantRefDto,
  Locale,
  PaginatedResponse,
} from '@packvio/shared';

/**
 * Swagger-annotated mirrors of the response contract in @packvio/shared.
 *
 * Each class `implements` its shared interface, so these are not a second
 * definition that can drift: if the shared type changes and this class does not,
 * the API stops compiling. The classes exist because @nestjs/swagger can only
 * read decorators off a runtime value, and a TypeScript interface has none —
 * the interface remains the thing apps/web imports.
 */

export class CatalogImageResponse implements CatalogImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, description: 'Localized alt text; null when unauthored.' })
  alt!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class CatalogCategoryResponse implements CatalogCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Localized name for the requested locale.' }) name!: string;
  @ApiProperty({ description: 'Localized URL segment for the requested locale.' }) slug!: string;
  @ApiProperty({ description: 'The same category\'s slug in the OTHER locale.' })
  alternateSlug!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;
  @ApiProperty({ nullable: true }) iconKey!: string | null;
  @ApiProperty({ nullable: true }) parentId!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Publicly visible products linked to this category.' })
  productCount!: number;
  @ApiPropertyOptional({ type: () => [CatalogCategoryResponse], description: 'Only on ?tree=true.' })
  children?: CatalogCategoryResponse[];
}

export class CatalogCategoryDetailResponse
  extends CatalogCategoryResponse
  implements CatalogCategoryDetailDto
{
  @ApiProperty({
    description:
      'The slug this category should be served under for the requested locale. Compare it ' +
      'with the slug in the URL; if they differ, redirect.',
  })
  canonicalSlug!: string;

  @ApiProperty({ description: 'True when the requested slug belonged to the other locale.' })
  slugMatchedOtherLocale!: boolean;

  @ApiProperty({
    type: () => [CatalogCategoryRefResponse],
    description:
      'Root-first chain of parents, EXCLUDING this category. Empty for a top-level category. ' +
      'Drives breadcrumbs: Home > Products > Cutlery > Spoons.',
  })
  ancestors!: CatalogCategoryRefResponse[];

  @ApiProperty({ type: () => [CatalogCategoryResponse] })
  declare children: CatalogCategoryResponse[];
}

export class CatalogCategoryRefResponse implements CatalogCategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() alternateSlug!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
}

export class CatalogVariantRefResponse implements CatalogVariantRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'TC-115-PS-LSPN-PRL', description: 'SKU. Latin — bidi-isolate inside Arabic copy.' })
  code!: string;
  @ApiProperty({ example: 'Pearl', description: 'What distinguishes this member of the family.' })
  label!: string;
  @ApiProperty({
    nullable: true,
    example: '#F2EFE6',
    description:
      'Hex swatch for the colour in this label, or null when none could be read with ' +
      'confidence. Null is common — fall back to the text label rather than guessing.',
  })
  swatch!: string | null;
  @ApiProperty({ description: 'This member keeps its own product page; link to this slug.' })
  slug!: string;
  @ApiProperty() alternateSlug!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty({ description: 'True for the member whose payload this is.' })
  isCurrent!: boolean;
}

export class CatalogVariantGroupResponse implements CatalogVariantGroupDto {
  @ApiProperty({ example: 'spoons-leaf-spoon-11-5-cm' }) key!: string;
  @ApiProperty({ enum: ['color', 'size', 'both'] }) axis!: CatalogVariantAxis;
  @ApiProperty({
    example: 'Leaf Spoon 11.5 cm',
    description: "The family's shared name — the product name minus the variant label.",
  })
  name!: string;
  @ApiProperty({ type: () => [CatalogVariantRefResponse] })
  variants!: CatalogVariantRefResponse[];
  @ApiProperty({ description: 'variants.length, so a card need not count to render "7 colours".' })
  count!: number;
}

export class CatalogProductSummaryResponse implements CatalogProductSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'PCS/08', description: 'SKU. Latin — bidi-isolate inside Arabic copy.' })
  code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'The same product\'s slug in the OTHER locale.' })
  alternateSlug!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty({ nullable: true }) shortDescription!: string | null;
  @ApiProperty({ nullable: true, example: '8 OZ' }) size!: string | null;
  @ApiProperty({ nullable: true, example: '301 GSM Ø80' }) material!: string | null;
  @ApiProperty({ nullable: true, description: 'Units per case — the B2B ordering unit.' })
  caseQuantity!: number | null;
  @ApiProperty({ nullable: true, description: 'Null until the Salla sync fills it.' })
  price!: number | null;
  @ApiProperty({ nullable: true }) salePrice!: number | null;
  @ApiProperty({ example: 'SAR' }) currency!: string;
  @ApiProperty({ enum: ['active', 'hidden', 'out_of_stock'] }) status!: CatalogProductStatus;
  @ApiProperty({ enum: ['cart', 'quote', 'both'] }) fulfilmentMode!: CatalogFulfilmentMode;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty({ description: "Whether the buyer's logo can be printed on this product." })
  supportsCustomPrinting!: boolean;
  @ApiProperty({
    type: () => CatalogCategoryRefResponse,
    nullable: true,
    description:
      "The product's primary category — the active one with the lowest sortOrder. Cards use " +
      'its slug to resolve a category icon.',
  })
  primaryCategory!: CatalogCategoryRefResponse | null;
  @ApiProperty({ type: () => CatalogImageResponse, nullable: true })
  primaryImage!: CatalogImageResponse | null;
  @ApiProperty({
    type: () => CatalogVariantGroupResponse,
    nullable: true,
    description:
      'The variant family this product belongs to, or null when it has no siblings. On a ' +
      'LISTING this row is the family representative and the group describes the whole ' +
      'family, so a card should render variantGroup.name rather than name.',
  })
  variantGroup!: CatalogVariantGroupResponse | null;
}

export class CatalogPriceTierResponse implements CatalogPriceTierDto {
  @ApiProperty() id!: string;
  @ApiProperty() minQuantity!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty({ nullable: true }) note!: string | null;
}

export class CatalogProductOptionValueResponse implements CatalogProductOptionValueDto {
  @ApiProperty() id!: string;
  @ApiProperty() value!: string;
  @ApiProperty() priceDelta!: number;
  @ApiProperty() sortOrder!: number;
}

export class CatalogProductOptionResponse implements CatalogProductOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) type!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: () => [CatalogProductOptionValueResponse] })
  values!: CatalogProductOptionValueResponse[];
}

export class CatalogProductDetailResponse
  extends CatalogProductSummaryResponse
  implements CatalogProductDetailDto
{
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Slug the requested locale should use. Redirect if it differs.' })
  canonicalSlug!: string;
  @ApiProperty() slugMatchedOtherLocale!: boolean;
  @ApiProperty({ nullable: true }) stockQuantity!: number | null;
  @ApiProperty() isStockUnlimited!: boolean;
  @ApiProperty({ nullable: true }) sallaUrl!: string | null;
  @ApiProperty({ nullable: true }) metaTitle!: string | null;
  @ApiProperty({ nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: () => [CatalogImageResponse] }) images!: CatalogImageResponse[];
  @ApiProperty({ type: () => [CatalogProductOptionResponse] })
  options!: CatalogProductOptionResponse[];
  @ApiProperty({ type: () => [CatalogPriceTierResponse], description: 'Ascending by minQuantity.' })
  priceTiers!: CatalogPriceTierResponse[];
  @ApiProperty({ type: () => [CatalogCategoryRefResponse] })
  categories!: CatalogCategoryRefResponse[];
  @ApiProperty({
    type: () => [CatalogProductSummaryResponse],
    description: 'Up to 8 from the same categories, preferring the same size or material.',
  })
  related!: CatalogProductSummaryResponse[];
}

export class CatalogSuggestionResponse implements CatalogSuggestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() alternateSlug!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty() code!: string;
  @ApiProperty({ nullable: true }) categoryName!: string | null;
  @ApiProperty({ nullable: true }) primaryImage!: string | null;
}

export class CatalogStatsResponse implements CatalogStatsDto {
  @ApiProperty() productCount!: number;
  @ApiProperty() categoryCount!: number;
}

export class CatalogHomeResponse implements CatalogHomeDto {
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty({ type: () => [CatalogCategoryResponse] }) categories!: CatalogCategoryResponse[];
  @ApiProperty({ type: () => [CatalogProductSummaryResponse] })
  featured!: CatalogProductSummaryResponse[];
  @ApiProperty({ type: () => [CatalogProductSummaryResponse] })
  newest!: CatalogProductSummaryResponse[];
  @ApiProperty({ type: () => CatalogStatsResponse }) stats!: CatalogStatsResponse;
}

/** Concrete instantiation of PaginatedResponse<T> — Swagger cannot read generics. */
export class PaginatedProductsResponse implements PaginatedResponse<CatalogProductSummaryDto> {
  @ApiProperty({ type: () => [CatalogProductSummaryResponse] })
  items!: CatalogProductSummaryResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() perPage!: number;
  @ApiProperty({ description: 'Total matching rows across all pages.' }) total!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasMore!: boolean;
}

export class CatalogErrorResponse implements CatalogErrorDto {
  @ApiProperty({ example: 404 }) statusCode!: number;
  @ApiProperty({ example: 'Product "no-such-slug" was not found.' }) message!: string;
  @ApiProperty({ example: 'Not Found' }) error!: string;
}
