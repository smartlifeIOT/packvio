import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import type {
  CatalogCategoryDetailDto,
  CatalogCategoryDto,
  CatalogCategoryRefDto,
  Locale,
} from '@packvio/shared';
import { Category } from '../entities/category.entity';
import { CatalogMapperService } from './catalog-mapper.service';
import type { CategoryCountRow } from './product-row.types';

@Injectable()
export class CategoryQueryService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mapper: CatalogMapperService,
  ) {}

  /**
   * All active categories with their product counts. Two queries: the rows, and
   * one grouped COUNT covering every category at once.
   *
   * Counting per category in a loop would be 18 queries today and one per new
   * category forever after — the classic N+1 that only shows up in production.
   */
  async list(locale: Locale, tree: boolean): Promise<CatalogCategoryDto[]> {
    const [entities, counts] = await Promise.all([
      this.categories.find({ where: { isActive: true }, order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.productCounts(),
    ]);

    const flat = entities.map((entity) =>
      this.mapper.toCategory(entity, locale, counts.get(entity.id) ?? 0),
    );

    return tree ? this.mapper.toCategoryTree(flat) : flat;
  }

  /**
   * A category page: the category, its immediate children, and the slug the
   * requested locale should be using.
   *
   * The lookup checks BOTH slug columns regardless of locale. A reader who lands
   * on `/en/categories/اكواب-قهوة-ورقية` — from a shared link, a stale bookmark,
   * a search engine that indexed the other language — gets the category with
   * `canonicalSlug: "coffee-cups"`, so Next can redirect. Resolving only the
   * requested locale's column would 404 a page that plainly exists.
   */
  async findBySlug(slug: string, locale: Locale): Promise<CatalogCategoryDetailDto> {
    const category = await this.categories.findOne({
      where: [
        { slugAr: slug, isActive: true },
        { slugEn: slug, isActive: true },
      ],
    });

    if (!category) throw new NotFoundException(`Category "${slug}" was not found.`);

    const [children, counts, ancestors] = await Promise.all([
      this.categories.find({
        where: { parentId: category.id, isActive: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      }),
      this.productCounts(),
      this.ancestorsOf(category.id, locale),
    ]);

    const base = this.mapper.toCategory(category, locale, counts.get(category.id) ?? 0);
    const canonicalSlug = locale === 'ar' ? category.slugAr : category.slugEn;

    return {
      ...base,
      canonicalSlug,
      slugMatchedOtherLocale: canonicalSlug !== slug,
      ancestors,
      children: children.map((child) =>
        this.mapper.toCategory(child, locale, counts.get(child.id) ?? 0),
      ),
    };
  }

  /**
   * TOP-LEVEL categories only — the number the hero and the About page show.
   *
   * Counting every row would say 28, while the navigation, the home grid and
   * the footer all show 18 families. A headline stat that disagrees with what
   * the reader can see and count is worse than no stat: subcategories are a way
   * of organising the 18, not eight more product ranges.
   */
  async countActive(): Promise<number> {
    return this.categories.countBy({ isActive: true, parentId: IsNull() });
  }

  /**
   * Visible product count for every category, INCLUDING its descendants.
   *
   * A product lives on the leaf ("Spoons"), never on both the leaf and the
   * parent, so a plain `GROUP BY category_id` would report Cutlery as holding
   * zero — a tile advertising an empty shelf in front of 56 products. The
   * recursive CTE maps every category to itself plus everything beneath it and
   * counts across that set.
   *
   * COUNTS SKUs, NOT VARIANT FAMILIES, and that is a commercial decision
   * rather than a technical one.
   *
   * It briefly counted families, to stop a tile reading "3 products" in front
   * of a listing showing one card. That mismatch is real but it is the lesser
   * problem. Counting families makes the Carry Bags tile say **"1 product"**
   * when Packvio stocks ten bags, Lunch Boxes say 1 in front of nine, and
   * Shakers 2 in front of eighteen — a wholesale buyer reads that as "they
   * barely carry this" and leaves. Understating the range on the page whose
   * entire job is to advertise it costs more than a count that does not equal
   * the number of cards on the next page.
   *
   * It also keeps ONE meaning for "product" across the site: the hero's
   * "213 products in the catalog" is the sum of these tiles. Counting families
   * here would have left two different numbers both labelled "products",
   * which is the sort of thing nobody notices until a customer does.
   *
   * The listing showing fewer cards than the count is self-explanatory once
   * you are on it — the card carries a size or colour picker that visibly
   * holds the rest.
   *
   * DISTINCT keeps the totals honest if a product is ever linked to both a
   * parent and one of its children: it is still one product, and summing the
   * tiles must not exceed the catalog.
   *
   * The visibility predicate matches ProductQueryService.VISIBLE — a count that
   * includes rows the listing then filters out is worse than no count at all,
   * because it sends readers to a tile promising products that are not there.
   */
  private async productCounts(): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<CategoryCountRow[]>(
      `WITH RECURSIVE subtree AS (
         -- Every category is its own ancestor, so a leaf still counts itself.
         SELECT id AS root_id, id AS node_id FROM categories
         UNION ALL
         SELECT s.root_id, c.id
         FROM categories c
         JOIN subtree s ON c.parent_id = s.node_id
       )
       SELECT s.root_id AS category_id,
              COUNT(DISTINCT p.id)::text AS product_count
       FROM subtree s
       JOIN product_categories pc ON pc.category_id = s.node_id
       JOIN products p ON p.id = pc.product_id
       WHERE p.deleted_at IS NULL AND p.status <> 'hidden'
       GROUP BY s.root_id`,
    );

    return new Map(rows.map((row) => [row.category_id, Number(row.product_count)]));
  }

  /**
   * The chain from the root down to (but excluding) `category`, in order.
   *
   * Breadcrumbs need it: "Home > Products > Cutlery > Spoons" is only
   * constructible if the child knows its parent's name and slug, and the
   * category detail payload is the only place the page has to get that from.
   *
   * Walked in SQL rather than by loading every category and climbing in JS,
   * because the depth is data and a two-level tree today is not a promise.
   */
  private async ancestorsOf(categoryId: string, locale: Locale): Promise<CatalogCategoryRefDto[]> {
    const rows = await this.categories.query<Array<{ id: string }>>(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, 0 AS depth FROM categories WHERE id = $1
         UNION ALL
         SELECT c.id, c.parent_id, chain.depth + 1
         FROM categories c
         JOIN chain ON c.id = chain.parent_id
       )
       SELECT id FROM chain WHERE depth > 0 ORDER BY depth DESC`,
      [categoryId],
    );

    if (rows.length === 0) return [];

    const entities = await this.categories.find({
      where: { id: In(rows.map((row) => row.id)) },
    });
    const byId = new Map(entities.map((entity) => [entity.id, entity]));

    // Re-ordered by the CTE's result, not the IN clause's arbitrary row order.
    return rows
      .map((row) => byId.get(row.id))
      .filter((entity): entity is Category => entity !== undefined)
      .map((entity) => this.mapper.toCategoryRef(entity, locale));
  }
}
