import { ApiProperty } from '@nestjs/swagger';
import type { Locale, QuoteRequestAcknowledgementDto } from '@packvio/shared';

/**
 * What a successful RFQ returns.
 *
 * Only the reference, the timestamp and the locale. It does NOT echo the
 * submission back: the body contains the submitter's name, phone and email, and
 * a response carrying personal data is a response that can end up in a proxy
 * log or a browser cache for no benefit — the client already has everything it
 * sent. The reference is the one fact the client does not have, because
 * Postgres allocates it.
 */
export class QuoteRequestAcknowledgementResponse implements QuoteRequestAcknowledgementDto {
  @ApiProperty({
    example: 'PV-2026-0001',
    description: 'Human-readable reference. Quote it when contacting sales.',
  })
  reference!: string;

  @ApiProperty({ example: '2026-08-19T09:32:14.000Z' })
  createdAt!: string;

  @ApiProperty({ enum: ['ar', 'en'], example: 'ar' })
  locale!: Locale;
}
