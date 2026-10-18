import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CatalogProductDetailDto,
  CatalogProductSort,
  CatalogProductSummaryDto,
  CatalogSuggestionDto,
  Locale,
  PaginatedResponse,
} from '@packvio/shared';
import { Product } from '../entities/product.entity';
import type { ProductListQueryDto } from '../dto/product-list-query.dto';
import type { SuggestQueryDto } from '../dto/suggest-query.dto';
import { normalizeSearchTerm } from '../search/arabic-normalize';
import { CatalogMapperService } from './catalog-mapper.service';
import type {
  CountRow,
  ProductSummaryRow,
  SuggestionRow,
  VariantMemberRow,
} from './product-row.types';
import { SqlParams } from './sql-params';

/**
 * What "publicly visible" means, in one place.
 *
 * Soft-deleted rows are gone; `hidden` is the editorial off switch. `out_of_stock`
 * deliberately stays visible — a wholesale buyer still wants to see the product
 * and request a quote for it, and hiding it would lose the RFQ.
 *
 * This exact predicate is also the WHERE clause of the partial indexes added in
 * the CatalogSearchAndReadIndexes migration; keep the two in step or the indexes
 * stop being usable.
 */
const VISIBLE = `p.deleted_at IS NULL AND p.status <> 'hidden'`;

/**
 * Picks one image per product without a second round trip and without
 * multiplying rows. A plain LEFT JOIN on product_images would return one row per
 * image and break both LIMIT and the row count; LATERAL … LIMIT 1 keeps it at
 * exactly one row per product.
 */
const PRIMARY_IMAGE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT i.id, i.url, i.alt_ar, i.alt_en, i.is_primary, i.sort_order
    FROM product_images i
    WHERE i.product_id = p.id
    ORDER BY i.is_primary DESC, i.sort_order ASC
    LIMIT 1
  ) img ON TRUE`;

/**
 * The product's primary category: the active one it sorts into first.
 *
 * LATERAL … LIMIT 1 for the same reason as the image join — a plain JOIN would
 * return one row per category membership and silently break both LIMIT and the
 * COUNT that pages the results.
 *
 * Cheap enough to sit on every summary query: `product_categories` is indexed
 * on `product_id` and the categories lookup is a primary-key hit, so it is one
 * index probe per returned row. The suggestion endpoint — the most
 * latency-sensitive one on the site, since it runs on every keystroke — has
 * used exactly this shape from the start.
 */
const PRIMARY_CATEGORY_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT c.id, c.name_ar, c.name_en, c.slug_ar, c.slug_en
    FROM product_categories pc
    JOIN categories c ON c.id = pc.category_id
    WHERE pc.product_id = p.id AND c.is_active = true
    ORDER BY c.sort_order ASC, c.id ASC
    LIMIT 1
  ) cat ON TRUE`;

const SUMMARY_COLUMNS = `
  p.id, p.code, p.slug_ar, p.slug_en, p.name_ar, p.name_en,
  p.short_description_ar, p.short_description_en,
  p.size, p.material, p.case_quantity, p.price, p.sale_price, p.currency,
  p.status, p.fulfilment_mode, p.is_featured, p.supports_custom_printing,
  p.variant_group, p.variant_axis,
  p.variant_label_ar, p.variant_label_en,
  p.variant_group_name_ar, p.variant_group_name_en, p.variant_swatch,
  cat.id AS category_id,
  cat.name_ar AS category_name_ar, cat.name_en AS category_name_en,
  cat.slug_ar AS category_slug_ar, cat.slug_en AS category_slug_en,
  img.id AS image_id, img.url AS image_url,
  img.alt_ar AS image_alt_ar, img.alt_en AS image_alt_en,
  img.is_primary AS image_is_primary, img.sort_order AS image_sort_order`;

/**
 * Columns the ORDER BY needs that the card itself does not.
 *
 * The grouped list wraps the base SELECT in a CTE and orders the OUTER query,
 * so anything `buildOrderBy` names has to survive into it. These three are the
 * ones that are not already on the card: `sort_order` and `created_at` back two
 * of the sort modes, and `name_ar_normalized` backs the search-relevance ladder.
 */
const ORDERING_COLUMNS = `p.sort_order, p.created_at, p.name_ar_normalized`;

/**
 * The family a row belongs to, for grouping.
 *
 * A product with no family is its OWN group — `COALESCE` to its id — rather
 * than being excluded. Without that the 41 ungrouped products would all share
 * a single NULL partition and 40 of them would vanish from every listing.
 */
const GROUP_KEY = `COALESCE(p.variant_group, p.id::text)`;

/**
 * Picks the one row that represents each family in a listing.
 *
 * A row WITH a photograph wins, which is the whole point: the Leaf Spoon family
 * has one card between seven colours, and a card showing the placeholder while
 * six photographed siblings sit behind it would be a worse grid than the
 * ungrouped one. `sort_order` then `id` break the tie so the choice is stable
 * across pages — otherwise page 2 can repeat a family page 1 already showed.
 */
const REPRESENTATIVE_RANK = `
  ROW_NUMBER() OVER (
    PARTITION BY ${GROUP_KEY}
    ORDER BY (img.id IS NULL), p.sort_order ASC, p.id ASC
  ) AS rep_rank`;

const RELATED_LIMIT = 8;

@Injectable()
export class ProductQueryService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mapper: CatalogMapperService,
  ) {}

  // --- list --------------------------------------------------------------

  /**
   * The product grid, ONE CARD PER VARIANT FAMILY.
   *
   * The catalogue lists every colour and every size as its own SKU, so before
   * grouping /categories/cutlery opened on seven Leaf Spoons in a row and the
   * reader had to read seven names to find the one difference between them.
   * Now a family is one card and the colours are chips on it.
   *
   * Three queries, regardless of page size: a COUNT of FAMILIES for the pager,
   * a SELECT of this page's representatives, and one more that fetches the
   * members of every family on the page. The third is what lets a card draw
   * seven swatches without seven more round trips, and it is skipped entirely
   * when nothing on the page has siblings.
   *
   * The COUNT is over families too. Counting SKUs while showing families makes
   * the pager lie in the most annoying way available — "213 products", 24 per
   * page, and page 4 is empty.
   */
  async list(query: ProductListQueryDto): Promise<PaginatedResponse<CatalogProductSummaryDto>> {
    const filters = new SqlParams();
    const where = this.buildFilters(query, filters);

    const countRows = await this.dataSource.query<CountRow[]>(
      `SELECT COUNT(DISTINCT ${GROUP_KEY})::text AS count FROM products p WHERE ${where}`,
      filters.values,
    );
    const total = Number(countRows[0]?.count ?? 0);

    // Rebuilt rather than reused: the SELECT appends LIMIT/OFFSET parameters,
    // and sharing one accumulator between two statements would leave the COUNT
    // carrying parameters it never references.
    const pageParams = new SqlParams();
    const pageWhere = this.buildFilters(query, pageParams);
    const orderBy = this.buildOrderBy(query, pageParams);
    const limit = pageParams.add(query.perPage);
    const offset = pageParams.add((query.page - 1) * query.perPage);

    /**
     * The CTE is aliased `p` on the way out so `buildOrderBy` keeps working
     * unchanged — it emits `p.name_ar`, `p.price` and friends, which now bind
     * to the CTE's columns instead of the table's. That is why ORDERING_COLUMNS
     * has to be selected inside: an ORDER BY naming a column the CTE did not
     * carry fails at runtime, not at compile time.
     */
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `WITH ranked AS (
         SELECT ${SUMMARY_COLUMNS}, ${ORDERING_COLUMNS}, ${REPRESENTATIVE_RANK}
         FROM products p
         ${PRIMARY_IMAGE_LATERAL}
         ${PRIMARY_CATEGORY_LATERAL}
         WHERE ${pageWhere}
       )
       SELECT * FROM ranked p
       WHERE p.rep_rank = 1
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      pageParams.values,
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.perPage);

    return {
      items: await this.withVariants(rows, query.locale),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages,
      // A page past the end returns an empty `items` array, not an error: the
      // caller asked a legitimate question and the answer is "nothing here".
      hasMore: query.page < totalPages,
    };
  }

  /**
   * Maps rows to summaries and attaches each one's variant family.
   *
   * One query for every family on the page, not one per card. A 24-card page of
   * Food Trays and Shakers would otherwise be 24 extra round trips to render
   * what is really two families.
   */
  private async withVariants(
    rows: ProductSummaryRow[],
    locale: Locale,
  ): Promise<CatalogProductSummaryDto[]> {
    const keys = [...new Set(rows.map((row) => row.variant_group).filter((k): k is string => k !== null))];
    const members = await this.loadVariantMembers(keys);
    return rows.map((row) => this.mapper.toProductSummary(row, locale, members.get(row.variant_group ?? '')));
  }

  /**
   * Every member of the named families, keyed by family.
   *
   * Ordered by `sort_order` then `code` so the chips on a card appear in the
   * same order every time — a colour row that reshuffles between renders is the
   * kind of thing a buyer misreads as a different product.
   *
   * Applies the same VISIBLE predicate as the listing: a hidden or soft-deleted
   * sibling must not appear as a chip linking to a page that 404s.
   */
  private async loadVariantMembers(keys: string[]): Promise<Map<string, VariantMemberRow[]>> {
    const grouped = new Map<string, VariantMemberRow[]>();
    if (keys.length === 0) return grouped;

    const params = new SqlParams();
    const keyList = params.add(keys);

    const rows = await this.dataSource.query<VariantMemberRow[]>(
      `SELECT p.id, p.code, p.slug_ar, p.slug_en, p.variant_group,
              p.variant_label_ar, p.variant_label_en, p.variant_swatch
       FROM products p
       WHERE ${VISIBLE} AND p.variant_group = ANY(${keyList}::text[])
       ORDER BY p.sort_order ASC, p.code ASC`,
      params.values,
    );

    for (const row of rows) {
      const list = grouped.get(row.variant_group);
      if (list) list.push(row);
      else grouped.set(row.variant_group, [row]);
    }
    return grouped;
  }

  private buildFilters(query: ProductListQueryDto, params: SqlParams): string {
    const clauses = [VISIBLE];

    if (query.category && query.category.length > 0) {
      // EXISTS rather than a JOIN: a product in two matching categories must not
      // appear twice, and a semi-join keeps the row count honest for COUNT(*).
      // That matters more now that several categories can be selected at once —
      // with a JOIN, ticking two boxes would duplicate every product in both.
      //
      // Multi-select is OR, not AND. A product belongs to exactly one category
      // in this catalog, so AND would return nothing for every selection of two
      // or more — a filter UI whose second click always empties the grid.
      const slugs = params.add(query.category);

      /**
       * DESCENDANTS INCLUDED. Products live on the leaf category, never on both
       * the leaf and its parent, so matching the slug alone would make
       * /categories/cutlery an empty page in front of 56 products. The
       * recursive CTE expands each requested slug to its whole subtree.
       *
       * Inactive categories terminate the walk rather than being skipped over:
       * hiding a parent must hide everything under it, or deactivating a family
       * would leave its children reachable through the parent's own listing.
       */
      clauses.push(`EXISTS (
        SELECT 1 FROM product_categories pc
        WHERE pc.product_id = p.id
          AND pc.category_id IN (
            WITH RECURSIVE roots AS (
              SELECT id FROM categories
              WHERE is_active = true
                AND (slug_ar = ANY(${slugs}::text[]) OR slug_en = ANY(${slugs}::text[]))
            ), subtree AS (
              SELECT id FROM roots
              UNION ALL
              SELECT c.id FROM categories c
              JOIN subtree s ON c.parent_id = s.id
              WHERE c.is_active = true
            )
            SELECT id FROM subtree
          )
      )`);
    }

    if (query.fulfilmentMode) {
      clauses.push(`p.fulfilment_mode = ${params.add(query.fulfilmentMode)}::products_fulfilment_mode_enum`);
    }

    if (query.featured !== undefined) {
      clauses.push(`p.is_featured = ${params.add(query.featured)}`);
    }

    if (query.customPrinting !== undefined) {
      clauses.push(`p.supports_custom_printing = ${params.add(query.customPrinting)}`);
    }

    const term = query.q ? normalizeSearchTerm(query.q) : '';
    if (term) {
      const like = params.add(`%${term}%`);
      clauses.push(`(
        p.name_ar_normalized LIKE ${like} ESCAPE '\\'
        OR lower(p.name_en) LIKE ${like} ESCAPE '\\'
        OR lower(p.code) LIKE ${like} ESCAPE '\\'
        OR lower(p.size) LIKE ${like} ESCAPE '\\'
        OR lower(p.material) LIKE ${like} ESCAPE '\\'
      )`);
    }

    return clauses.join(' AND ');
  }

  /**
   * Sort order, with search relevance taking precedence when a term is present.
   *
   * The relevance ladder exists so that searching a SKU behaves the way anyone
   * typing a SKU expects: "PCS/08" puts PCS/08 first, not fourteenth behind
   * every product whose description happens to contain the substring.
   *
   * Every branch ends in `p.id` so equal-valued rows keep a stable order across
   * pages — without it, page 2 can repeat or skip rows the planner reshuffled.
   */
  private buildOrderBy(query: ProductListQueryDto, params: SqlParams): string {
    const parts: string[] = [];
    const term = query.q ? normalizeSearchTerm(query.q) : '';

    if (term) {
      const exact = params.add(term);
      const prefix = params.add(`${term}%`);
      parts.push(`CASE
        WHEN lower(p.code) = ${exact} THEN 0
        WHEN lower(p.code) LIKE ${prefix} ESCAPE '\\' THEN 1
        WHEN p.name_ar_normalized LIKE ${prefix} ESCAPE '\\' THEN 2
        WHEN lower(p.name_en) LIKE ${prefix} ESCAPE '\\' THEN 2
        ELSE 3
      END`);
    }

    parts.push(...sortColumns(query.sort, query.locale));
    parts.push('p.id ASC');
    return parts.join(', ');
  }

  // --- detail ------------------------------------------------------------

  async findBySlug(slug: string, locale: Locale): Promise<CatalogProductDetailDto> {
    const product = await this.loadDetail('slug', slug);
    if (!product) throw new NotFoundException(`Product "${slug}" was not found.`);

    const canonicalSlug = locale === 'ar' ? product.slugAr : product.slugEn;
    return this.assembleDetail(product, locale, canonicalSlug !== slug);
  }

  async findByCode(code: string, locale: Locale): Promise<CatalogProductDetailDto> {
    const product = await this.loadDetail('code', code);
    if (!product) throw new NotFoundException(`Product with code "${code}" was not found.`);

    // A SKU is not localized, so arriving by code is never a wrong-locale URL.
    return this.assembleDetail(product, locale, false);
  }

  /**
   * One query for the product and all four of its child collections. TypeORM
   * collapses the join's row multiplication back into a single entity graph, so
   * this stays one round trip rather than one per collection.
   */
  private loadDetail(by: 'slug' | 'code', value: string): Promise<Product | null> {
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('p.options', 'opt')
      .leftJoinAndSelect('opt.values', 'optval')
      .leftJoinAndSelect('p.priceTiers', 'tier')
      .leftJoinAndSelect('p.categoryLinks', 'pc')
      .leftJoinAndSelect('pc.category', 'cat')
      // Soft-deleted rows are excluded by TypeORM automatically; `hidden` is ours.
      .andWhere(`p.status <> 'hidden'`);

    if (by === 'code') {
      qb.andWhere('p.code = :value', { value });
    } else {
      // Resolves against BOTH locales, so an Arabic slug on an English request
      // still finds the product — the response then reports the canonical slug
      // and the caller redirects instead of 404ing a page that exists.
      qb.andWhere('(p.slugAr = :value OR p.slugEn = :value)', { value });
    }

    return qb.getOne();
  }

  private async assembleDetail(
    product: Product,
    locale: Locale,
    slugMatchedOtherLocale: boolean,
  ): Promise<CatalogProductDetailDto> {
    const categoryIds = (product.categoryLinks ?? []).map((link) => link.categoryId);
    /**
     * Siblings are loaded even though the detail page is per-SKU: the page has
     * to offer the other colours, and each chip links to that sibling's OWN
     * slug. Grouping is presentation over unchanged rows — every variant keeps
     * its page, because the slugs are public URLs and `code` is what the Salla
     * sync joins on.
     */
    const [related, members] = await Promise.all([
      this.findRelated(product, categoryIds, locale),
      product.variantGroup ? this.loadVariantMembers([product.variantGroup]) : Promise.resolve(null),
    ]);
    const detail = this.mapper.toProductDetail(
      product,
      locale,
      related,
      members?.get(product.variantGroup ?? '') ?? undefined,
    );

    return { ...detail, slugMatchedOtherLocale };
  }

  /**
   * Siblings for the "you might also need" rail.
   *
   * Ranked by how much they have in common with the product being viewed: same
   * size and material first, then one or the other, then merely the same
   * category. For packaging that ordering is the useful one — someone looking at
   * an 8 oz cup most wants the 8 oz lid that fits it.
   */
  private async findRelated(
    product: Product,
    categoryIds: string[],
    locale: Locale,
  ): Promise<CatalogProductSummaryDto[]> {
    if (categoryIds.length === 0) return [];

    const params = new SqlParams();
    const ids = params.add(categoryIds);
    const self = params.add(product.id);
    const size = params.add(product.size);
    const material = params.add(product.material);
    const group = params.add(product.variantGroup ?? product.id);
    const limit = params.add(RELATED_LIMIT);

    /**
     * Excludes the viewed product's WHOLE FAMILY, not just the product itself.
     * The product page already offers every sibling as a variant chip, so a
     * "you might also need" rail repeating the other six Leaf Spoon colours
     * underneath would be the same list twice. `group` is NULL for a product
     * with no siblings, and `IS DISTINCT FROM` handles that without the NULL
     * swallowing the comparison and excluding everything.
     */
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `WITH ranked AS (
         SELECT ${SUMMARY_COLUMNS}, ${ORDERING_COLUMNS}, ${REPRESENTATIVE_RANK},
                (CASE WHEN p.size IS NOT DISTINCT FROM ${size} THEN 0 ELSE 1 END)
                + (CASE WHEN p.material IS NOT DISTINCT FROM ${material} THEN 0 ELSE 1 END)
                AS affinity
         FROM products p
         ${PRIMARY_IMAGE_LATERAL}
         ${PRIMARY_CATEGORY_LATERAL}
         WHERE ${VISIBLE}
           AND p.id <> ${self}
           AND ${GROUP_KEY} IS DISTINCT FROM ${group}
           AND EXISTS (
             SELECT 1 FROM product_categories pc
             WHERE pc.product_id = p.id AND pc.category_id = ANY(${ids}::uuid[])
           )
       )
       SELECT * FROM ranked p
       WHERE p.rep_rank = 1
       ORDER BY p.affinity, p.sort_order ASC, p.id ASC
       LIMIT ${limit}`,
      params.values,
    );

    return this.withVariants(rows, locale);
  }

  // --- autocomplete ------------------------------------------------------

  async suggest(query: SuggestQueryDto): Promise<CatalogSuggestionDto[]> {
    const term = normalizeSearchTerm(query.q);
    if (!term) return [];

    const params = new SqlParams();
    const like = params.add(`%${term}%`);
    const exact = params.add(term);
    const prefix = params.add(`${term}%`);
    const limit = params.add(query.limit);

    const rows = await this.dataSource.query<SuggestionRow[]>(
      `SELECT p.id, p.code, p.slug_ar, p.slug_en, p.name_ar, p.name_en,
              cat.name_ar AS category_name_ar, cat.name_en AS category_name_en,
              img.url AS image_url
       FROM products p
       ${PRIMARY_IMAGE_LATERAL}
       ${PRIMARY_CATEGORY_LATERAL}
       WHERE ${VISIBLE}
         AND (
           p.name_ar_normalized LIKE ${like} ESCAPE '\\'
           OR lower(p.name_en) LIKE ${like} ESCAPE '\\'
           OR lower(p.code) LIKE ${like} ESCAPE '\\'
           OR lower(p.size) LIKE ${like} ESCAPE '\\'
           OR lower(p.material) LIKE ${like} ESCAPE '\\'
         )
       ORDER BY
         CASE
           WHEN lower(p.code) = ${exact} THEN 0
           WHEN lower(p.code) LIKE ${prefix} ESCAPE '\\' THEN 1
           WHEN p.name_ar_normalized LIKE ${prefix} ESCAPE '\\' THEN 2
           WHEN lower(p.name_en) LIKE ${prefix} ESCAPE '\\' THEN 2
           ELSE 3
         END,
         p.sort_order ASC, p.id ASC
       LIMIT ${limit}`,
      params.values,
    );

    return rows.map((row) => this.mapper.toSuggestion(row, query.locale));
  }

  // --- home-page slices --------------------------------------------------

  async findFeatured(locale: Locale, limit: number): Promise<CatalogProductSummaryDto[]> {
    /**
     * A true filter on the flag — featured means featured.
     *
     * This used to sort by `is_featured DESC` and top the rail up with whatever
     * came next in catalog order, because nothing was flagged yet. Now that the
     * twelve are chosen in catalog.json, that fallback would be actively
     * misleading: an editor who un-flags a product would see it keep appearing
     * in the rail and reasonably conclude the flag does nothing.
     */
    const params = new SqlParams();
    const limitParam = params.add(limit);

    /**
     * Grouped like the grid, and for a reason the data already shows: PCS/08
     * and PCS/12 are both flagged, and both are Single Wall Coffee Cups. An
     * ungrouped rail would open the home page with the same product twice,
     * which is exactly the clutter grouping exists to remove. The rail returns
     * one card for that family and eleven for the rest.
     */
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `WITH ranked AS (
         SELECT ${SUMMARY_COLUMNS}, ${ORDERING_COLUMNS}, ${REPRESENTATIVE_RANK}
         FROM products p
         ${PRIMARY_IMAGE_LATERAL}
         ${PRIMARY_CATEGORY_LATERAL}
         WHERE ${VISIBLE} AND p.is_featured = true
       )
       SELECT * FROM ranked p
       WHERE p.rep_rank = 1
       ORDER BY p.sort_order ASC, p.id ASC
       LIMIT ${limitParam}`,
      params.values,
    );

    return this.withVariants(rows, locale);
  }

  async findNewest(locale: Locale, limit: number): Promise<CatalogProductSummaryDto[]> {
    const params = new SqlParams();
    const limitParam = params.add(limit);

    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `WITH ranked AS (
         SELECT ${SUMMARY_COLUMNS}, ${ORDERING_COLUMNS}, ${REPRESENTATIVE_RANK}
         FROM products p
         ${PRIMARY_IMAGE_LATERAL}
         ${PRIMARY_CATEGORY_LATERAL}
         WHERE ${VISIBLE}
       )
       SELECT * FROM ranked p
       WHERE p.rep_rank = 1
       ORDER BY p.created_at DESC, p.id ASC
       LIMIT ${limitParam}`,
      params.values,
    );

    return this.withVariants(rows, locale);
  }

  async countVisible(): Promise<number> {
    const rows = await this.dataSource.query<CountRow[]>(
      `SELECT COUNT(*)::text AS count FROM products p WHERE ${VISIBLE}`,
    );
    return Number(rows[0]?.count ?? 0);
  }
}

/** Sort expressions per requested order. `name` follows the requested locale. */
function sortColumns(sort: CatalogProductSort, locale: Locale): string[] {
  switch (sort) {
    case 'name':
      return [locale === 'ar' ? 'p.name_ar ASC' : 'p.name_en ASC'];
    case 'newest':
      return ['p.created_at DESC'];
    case 'price_asc':
      // NULLS LAST because price is null until the Salla sync fills it, and a
      // wall of priceless products is not the top of a cheapest-first list.
      return ['p.price ASC NULLS LAST'];
    case 'price_desc':
      return ['p.price DESC NULLS LAST'];
    case 'featured':
    default:
      return ['p.is_featured DESC', 'p.sort_order ASC'];
  }
}
