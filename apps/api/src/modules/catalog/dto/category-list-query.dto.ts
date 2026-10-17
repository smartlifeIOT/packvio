import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { LocaleQueryDto } from './locale-query.dto';
import { parseQueryBoolean } from './product-list-query.dto';

export class CategoryListQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Return categories nested under their parents instead of one flat, sorted list. ' +
      'Flat is the default because the navigation and the category grid both want it flat.',
  })
  @IsOptional()
  // Reads the raw value off `obj` — see parseQueryBoolean for why `value` is
  // already ruined by the pipe's implicit boolean conversion.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => parseQueryBoolean(obj.tree) ?? false)
  @IsBoolean()
  tree: boolean = false;
}
