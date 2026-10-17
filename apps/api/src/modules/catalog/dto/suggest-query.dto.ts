import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { LocaleQueryDto } from './locale-query.dto';

export const MAX_SUGGEST_LIMIT = 20;
export const DEFAULT_SUGGEST_LIMIT = 8;

/**
 * Header autocomplete. Capped hard: this endpoint is hit on every keystroke, so
 * it must stay cheap by construction rather than by the caller's good manners.
 */
export class SuggestQueryDto extends LocaleQueryDto {
  @ApiProperty({ description: 'Partial search term. Same matching rules as the product list.' })
  @IsString()
  @MinLength(1, { message: 'q must not be empty' })
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_SUGGEST_LIMIT,
    default: DEFAULT_SUGGEST_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SUGGEST_LIMIT)
  limit: number = DEFAULT_SUGGEST_LIMIT;
}
