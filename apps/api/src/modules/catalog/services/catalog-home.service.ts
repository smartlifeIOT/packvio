import { Injectable } from '@nestjs/common';
import type { CatalogHomeDto, Locale } from '@packvio/shared';
import { CategoryQueryService } from './category-query.service';
import { ProductQueryService } from './product-query.service';

export const HOME_CATEGORY_LIMIT = 8;
export const HOME_FEATURED_LIMIT = 12;
export const HOME_NEWEST_LIMIT = 8;

/**
 * Assembles the home page in one request.
 *
 * The alternative — Next firing four calls and stitching them together — costs
 * four round trips on the site's most-visited page and makes the ISR cache
 * entry depend on four independently-expiring responses. One endpoint, one
 * cache entry, one revalidation.
 *
 * The five underlying queries run concurrently rather than in sequence, so the
 * endpoint costs about as much wall-clock as its slowest part.
 */
@Injectable()
export class CatalogHomeService {
  constructor(
    private readonly categories: CategoryQueryService,
    private readonly products: ProductQueryService,
  ) {}

  async build(locale: Locale): Promise<CatalogHomeDto> {
    const [categories, featured, newest, productCount, categoryCount] = await Promise.all([
      this.categories.list(locale, false),
      this.products.findFeatured(locale, HOME_FEATURED_LIMIT),
      this.products.findNewest(locale, HOME_NEWEST_LIMIT),
      this.products.countVisible(),
      this.categories.countActive(),
    ]);

    return {
      locale,
      categories: categories.slice(0, HOME_CATEGORY_LIMIT),
      featured,
      newest,
      stats: { productCount, categoryCount },
    };
  }
}
