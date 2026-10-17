import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  CreateQuoteRequestDto as CreateQuoteRequestContract,
  CreateQuoteRequestItemDto as CreateQuoteRequestItemContract,
  Locale,
  QuoteRequestSource,
  QuoteRequestUnit,
} from '@packvio/shared';
import { IsSaudiPhoneNumber } from './is-saudi-phone.validator';

const LOCALES: readonly Locale[] = ['ar', 'en'] as const;
const SOURCES: readonly QuoteRequestSource[] = ['quote_page', 'product', 'contact'] as const;
const UNITS: readonly QuoteRequestUnit[] = ['case', 'piece'] as const;

/** Collapses whitespace and trims. Applied to every free-text field. */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
  );

/** '' from an untouched optional input means "not provided", not "empty string". */
const emptyToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value ?? null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
  });

export class CreateQuoteRequestItemDto implements CreateQuoteRequestItemContract {
  @ApiPropertyOptional({
    nullable: true,
    example: 'PCS/08',
    description:
      'Catalog code. Null for a free-text line — a buyer asking for something we do not ' +
      'stock is a lead, not a validation error.',
  })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(64)
  productCode: string | null = null;

  @ApiProperty({
    example: 'Single Wall Coffee Cup 8 oz',
    description: 'Snapshot of what the buyer asked for, kept even if the product is renamed.',
  })
  @trimmed()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  productName!: string;

  @ApiProperty({
    example: 2,
    description: 'In `unit`s. The form steps this in cases — this is wholesale.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // A cap, not a business rule: it stops a fat finger turning into a 9-digit
  // quantity in a sales inbox. Anything genuinely larger is a phone call.
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ enum: UNITS, default: 'case' })
  @IsOptional()
  @IsIn(UNITS as readonly string[])
  unit: QuoteRequestUnit = 'case';

  @ApiPropertyOptional({ nullable: true, example: 'Two-colour logo, matte finish' })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(1000)
  note: string | null = null;
}

export class CreateQuoteRequestDto implements CreateQuoteRequestContract {
  @ApiProperty({ example: 'نضال العتيبي' })
  @trimmed()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contactName!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Cafe Rise' })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(200)
  companyName: string | null = null;

  /**
   * Validated with the SHARED normaliser rather than a regex written here, so
   * the browser and the server accept exactly the same set of spellings. The
   * value is normalised to E.164 in the service, not here: a transform that
   * rewrites the field before validation would make the error message point at
   * a string the user never typed.
   */
  @ApiProperty({
    example: '+966 59 481 6791',
    description:
      'Saudi mobile. Accepts +966…, 00966…, 966…, 05… and 5… spellings, with any ' +
      'spacing and with Arabic-Indic digits. Stored as +9665XXXXXXXX.',
  })
  @trimmed()
  @IsString()
  @IsSaudiPhoneNumber()
  phone!: string;

  @ApiProperty({ example: 'nedhal@smavioltd.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: 'الرياض' })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(120)
  city: string | null = null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(4000)
  message: string | null = null;

  @ApiProperty({ enum: LOCALES, default: 'ar' })
  @IsOptional()
  @IsIn(LOCALES as readonly string[])
  locale: Locale = 'ar';

  @ApiProperty({ enum: SOURCES, default: 'quote_page' })
  @IsOptional()
  @IsIn(SOURCES as readonly string[])
  source: QuoteRequestSource = 'quote_page';

  @ApiProperty({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  needsCustomPrinting = false;

  /**
   * At least one line. An RFQ with no items is a contact form — and the contact
   * form posts here too, with a single line describing the enquiry, precisely
   * so sales has one inbox and one shape to read rather than two.
   */
  @ApiProperty({ type: () => [CreateQuoteRequestItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteRequestItemDto)
  items!: CreateQuoteRequestItemDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(120)
  utmSource: string | null = null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(120)
  utmMedium: string | null = null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(120)
  utmCampaign: string | null = null;

  /**
   * HONEYPOT. Hidden from humans, irresistible to form-filling bots. Kept as a
   * validated field rather than read off the raw body because the global pipe
   * runs `forbidNonWhitelisted` — an unmodelled property would 400, which would
   * tell the bot exactly which field to stop filling.
   */
  @ApiPropertyOptional({
    nullable: true,
    description: 'Honeypot. Must be empty. Filled submissions are accepted and discarded.',
  })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(200)
  website: string | null = null;
}

