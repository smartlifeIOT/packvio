import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { CatalogCategoryDetailDto, CatalogCategoryDto } from '@packvio/shared';
import { HttpCacheInterceptor } from '../../../common/interceptors/http-cache.interceptor';
import { CategoryListQueryDto } from '../dto/category-list-query.dto';
import { LocaleQueryDto } from '../dto/locale-query.dto';
import {
  CatalogCategoryDetailResponse,
  CatalogCategoryResponse,
  CatalogErrorResponse,
} from '../dto/responses/catalog-response.dto';
import { CategoryQueryService } from '../services/category-query.service';

@ApiTags('catalog')
@Controller('catalog/categories')
@UseInterceptors(HttpCacheInterceptor)
export class CatalogCategoriesController {
  constructor(private readonly categories: CategoryQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'List active categories',
    description:
      'Every active category, sorted by sortOrder, each with the count of publicly visible ' +
      'products linked to it. Pass ?tree=true to nest children under their parents.',
  })
  @ApiOkResponse({ type: [CatalogCategoryResponse] })
  list(@Query() query: CategoryListQueryDto): Promise<CatalogCategoryDto[]> {
    return this.categories.list(query.locale, query.tree);
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get one category by slug, in either locale',
    description:
      'Resolves the slug against BOTH locales, so an Arabic slug works on an English request. ' +
      'When the slug belonged to the other locale, `slugMatchedOtherLocale` is true and ' +
      '`canonicalSlug` holds the slug the requested locale should redirect to.',
  })
  @ApiParam({ name: 'slug', example: 'coffee-cups' })
  @ApiOkResponse({ type: CatalogCategoryDetailResponse })
  @ApiNotFoundResponse({ type: CatalogErrorResponse })
  findOne(
    @Param('slug') slug: string,
    @Query() query: LocaleQueryDto,
  ): Promise<CatalogCategoryDetailDto> {
    return this.categories.findBySlug(slug, query.locale);
  }
}
