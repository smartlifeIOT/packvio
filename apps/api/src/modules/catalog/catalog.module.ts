import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogCategoriesController } from './controllers/catalog-categories.controller';
import { CatalogProductsController } from './controllers/catalog-products.controller';
import { CatalogController } from './controllers/catalog.controller';
import { Category } from './entities/category.entity';
import { PriceTier } from './entities/price-tier.entity';
import { ProductCategory } from './entities/product-category.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductOptionValue } from './entities/product-option-value.entity';
import { ProductOption } from './entities/product-option.entity';
import { Product } from './entities/product.entity';
import { CatalogHomeService } from './services/catalog-home.service';
import { CatalogMapperService } from './services/catalog-mapper.service';
import { CategoryQueryService } from './services/category-query.service';
import { ProductQueryService } from './services/product-query.service';

/**
 * The public read API. No writes, no Salla — the catalog mirror in Postgres is
 * the only source, and everything here is cacheable by construction.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      Product,
      ProductCategory,
      ProductImage,
      ProductOption,
      ProductOptionValue,
      PriceTier,
    ]),
  ],
  controllers: [CatalogController, CatalogCategoriesController, CatalogProductsController],
  providers: [CatalogMapperService, CategoryQueryService, ProductQueryService, CatalogHomeService],
  exports: [TypeOrmModule, CatalogMapperService],
})
export class CatalogModule {}
