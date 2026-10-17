import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import type { Locale } from '@packvio/shared';

/**
 * The one place `?locale=` is defined. Every public catalog query extends this
 * rather than redeclaring the field, so the default can never drift between
 * endpoints — and Arabic being the default is a product decision, not a
 * per-controller accident.
 */
export class LocaleQueryDto {
  @ApiPropertyOptional({
    enum: ['ar', 'en'],
    default: 'ar',
    description:
      'Locale to render localized fields in. Arabic is the site default. Every response ' +
      'also carries `alternateSlug` — the same row addressed in the other locale.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? 'ar' : value))
  @IsIn(['ar', 'en'], { message: 'locale must be either "ar" or "en"' })
  locale: Locale = 'ar';
}
