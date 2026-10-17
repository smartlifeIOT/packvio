import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type {
  CatalogProductDetailDto,
  CatalogProductSummaryDto,
  PaginatedResponse,
} from '@packvio/shared';
import { HttpCacheInterceptor } from '../../../common/interceptors/http-cache.interceptor';
import { LocaleQueryDto } from '../dto/locale-query.dto';
import { ProductListQueryDto } from '../dto/product-list-query.dto';
import {
  CatalogErrorResponse,
  CatalogProductDetailResponse,
  PaginatedProductsResponse,
} from '../dto/responses/catalog-response.dto';
import { ProductQueryService } from '../services/product-query.service';

@ApiTags('catalog')
@Controller('catalog/products')
@UseInterceptors(HttpCacheInterceptor)
export class CatalogProductsController {
  constructor(private readonly products: ProductQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'List products',
    description:
      'Paginated, filterable product grid. Runs as two SQL statements regardless of page ' +
      'size — one COUNT and one SELECT that carries each row\'s primary image with it.',
  })
  @ApiOkResponse({ type: PaginatedProductsResponse })
  list(@Query() query: ProductListQueryDto): Promise<PaginatedResponse<CatalogProductSummaryDto>> {
    return this.products.list(query);
  }

  /**
   * Declared BEFORE `:slug`. Express matches routes in declaration order, so with
   * the order reversed every request to /by-code/PCS%2F08 would be swallowed by
   * the slug route and 404 on a product that exists.
   */
  @Get('by-code/:code')
  @ApiOperation({
    summary: 'Get one product by SKU',
    description:
      'Codes contain characters that are not URL-safe — "PCS/08" and "SBL/150 OPS" — so the ' +
      'code must be percent-encoded by the caller (PCS%2F08, SBL%2F150%20OPS).',
  })
  @ApiParam({ name: 'code', example: 'PCS%2F08', description: 'Percent-encoded SKU.' })
  @ApiOkResponse({ type: CatalogProductDetailResponse })
  @ApiNotFoundResponse({ type: CatalogErrorResponse })
  findByCode(
    @Param('code') code: string,
    @Query() query: LocaleQueryDto,
  ): Promise<CatalogProductDetailDto> {
    return this.products.findByCode(code, query.locale);
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get one product by slug, in either locale',
    description:
      'Full product payload: images, options with values, price tiers sorted by minQuantity, ' +
      'categories and up to 8 related products. Like the category endpoint, the slug resolves ' +
      'against both locales and reports `canonicalSlug` so the caller can redirect.',
  })
  @ApiParam({ name: 'slug', example: 'single-wall-coffee-cup-8-oz' })
  @ApiOkResponse({ type: CatalogProductDetailResponse })
  @ApiNotFoundResponse({ type: CatalogErrorResponse })
  findOne(
    @Param('slug') slug: string,
    @Query() query: LocaleQueryDto,
  ): Promise<CatalogProductDetailDto> {
    return this.products.findBySlug(slug, query.locale);
  }
}
