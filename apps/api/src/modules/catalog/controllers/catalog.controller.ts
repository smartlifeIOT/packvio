import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CatalogHomeDto, CatalogSuggestionDto } from '@packvio/shared';
import { HttpCacheInterceptor } from '../../../common/interceptors/http-cache.interceptor';
import { LocaleQueryDto } from '../dto/locale-query.dto';
import {
  CatalogHomeResponse,
  CatalogSuggestionResponse,
} from '../dto/responses/catalog-response.dto';
import { SuggestQueryDto } from '../dto/suggest-query.dto';
import { CatalogHomeService } from '../services/catalog-home.service';
import { ProductQueryService } from '../services/product-query.service';

@ApiTags('catalog')
@Controller('catalog')
@UseInterceptors(HttpCacheInterceptor)
export class CatalogController {
  constructor(
    private readonly home: CatalogHomeService,
    private readonly products: ProductQueryService,
  ) {}

  @Get('home')
  @ApiOperation({
    summary: 'Everything the home page needs, in one call',
    description:
      'Top 8 categories with counts and images, 12 featured products, the 8 newest, and ' +
      'catalog totals. One endpoint so the home page is one request and one ISR cache entry ' +
      'rather than four independently-expiring ones.',
  })
  @ApiOkResponse({ type: CatalogHomeResponse })
  getHome(@Query() query: LocaleQueryDto): Promise<CatalogHomeDto> {
    return this.home.build(query.locale);
  }

  @Get('search/suggest')
  @ApiOperation({
    summary: 'Header autocomplete',
    description:
      'Deliberately small rows — id, name, slug, code, category name, one image URL. Same ' +
      'matching and ranking rules as the product list, including Arabic normalisation.',
  })
  @ApiOkResponse({ type: [CatalogSuggestionResponse] })
  suggest(@Query() query: SuggestQueryDto): Promise<CatalogSuggestionDto[]> {
    return this.products.suggest(query);
  }
}
