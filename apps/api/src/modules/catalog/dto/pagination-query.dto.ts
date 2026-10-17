import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LocaleQueryDto } from './locale-query.dto';

/** Upper bound on `perPage`. A public endpoint must not let a caller ask for everything. */
export const MAX_PER_PAGE = 60;
export const DEFAULT_PER_PAGE = 24;

/**
 * Shared pagination, extending the locale contract — every paginated catalog
 * endpoint is also localized, so the two always travel together.
 */
export class PaginationQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: '1-based page number.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be 1 or greater' })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PER_PAGE,
    default: DEFAULT_PER_PAGE,
    description: `Items per page. Capped at ${MAX_PER_PAGE}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'perPage must be an integer' })
  @Min(1, { message: 'perPage must be 1 or greater' })
  @Max(MAX_PER_PAGE, { message: `perPage must not exceed ${MAX_PER_PAGE}` })
  perPage: number = DEFAULT_PER_PAGE;
}
