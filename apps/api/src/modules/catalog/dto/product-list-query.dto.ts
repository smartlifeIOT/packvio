import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CatalogFulfilmentMode, CatalogProductSort } from '@packvio/shared';
import { PaginationQueryDto } from './pagination-query.dto';

export const PRODUCT_SORTS: readonly CatalogProductSort[] = [
  'featured',
  'name',
  'newest',
  'price_asc',
  'price_desc',
] as const;

const FULFILMENT_MODES: readonly CatalogFulfilmentMode[] = ['cart', 'quote', 'both'] as const;

/**
 * Turns the several spellings of "yes" a query string can carry into a boolean.
 *
 * Reads from `obj` — the untouched plain object — rather than `value`, and that
 * detail is the whole point. The global ValidationPipe runs with
 * `enableImplicitConversion: true`, which converts a field typed `boolean` with
 * `Boolean(value)` BEFORE this transform runs. `Boolean("false")` is `true`, so
 * by the time `value` arrives it is already `true` for every non-empty string,
 * and `?featured=false` silently means the opposite of what it says. Going back
 * to `obj` gets the raw query string that the caller actually sent.
 */
export function parseQueryBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  const normalized = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return undefined;
}

/**
 * Normalises the several ways a query string can carry a list.
 *
 * Express gives `?category=a&category=b` as `['a','b']` but `?category=a` as the
 * bare string `'a'`, and a hand-written link is as likely to use `?category=a,b`.
 * All three mean the same thing to a reader, so all three are accepted and
 * collapsed here rather than at the three call sites that would otherwise each
 * have to remember. Blanks are dropped and duplicates collapsed, so
 * `?category=&category=coffee-cups&category=coffee-cups` is one filter, not three.
 *
 * Reads `obj` rather than `value` for the same reason `parseQueryBoolean` does:
 * implicit conversion has already had its way with `value` by this point.
 */
export function parseSlugList(raw: unknown): string[] | undefined {
  const source = Array.isArray(raw) ? raw : [raw];
  const slugs = source
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return slugs.length > 0 ? [...new Set(slugs)] : undefined;
}

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Category slug(s) to filter by. Repeat the parameter (`?category=a&category=b`) or ' +
      'pass a comma-separated list; a product matching ANY of them is included. Resolves ' +
      "against either locale's slug column, so an Arabic slug works on an English request " +
      'and vice versa.',
    example: ['coffee-cups', 'soup-cups'],
    type: [String],
  })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => parseSlugList(obj.category))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @ArrayMaxSize(24)
  category?: string[];

  @ApiPropertyOptional({
    description:
      'Free-text search across Arabic name, English name, code, size and material. ' +
      'Case-insensitive and partial. Arabic matching is hamza-, teh-marbuta- and ' +
      'tashkeel-insensitive, so "اكواب" and "أكواب" return the same rows. An exact ' +
      'code match (e.g. "PCS/08") is ranked first.',
    example: 'كوب',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({
    enum: PRODUCT_SORTS,
    default: 'featured',
    description:
      'Sort order. When `q` is present, search relevance is applied first and this ' +
      'becomes the tiebreaker.',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORTS as readonly string[])
  sort: CatalogProductSort = 'featured';

  @ApiPropertyOptional({
    enum: FULFILMENT_MODES,
    description: 'Filter to products offering this conversion path.',
  })
  @IsOptional()
  @IsIn(FULFILMENT_MODES as readonly string[])
  fulfilmentMode?: CatalogFulfilmentMode;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Restrict to editorially featured products. Accepts true/false, 1/0, yes/no.',
  })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => parseQueryBoolean(obj.featured))
  featured?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Restrict to products a buyer can have their logo printed on. Accepts true/false, ' +
      '1/0, yes/no. Reads `obj` for the same reason `featured` does.',
  })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => parseQueryBoolean(obj.customPrinting))
  customPrinting?: boolean;
}
