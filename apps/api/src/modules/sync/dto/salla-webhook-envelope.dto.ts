import { plainToInstance } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, validateSync } from 'class-validator';

/**
 * The envelope every Salla webhook shares. Property names are snake_case on
 * purpose — this is the wire shape, and renaming it here would only hide what
 * actually arrived.
 *
 * Validated with `validateSync` rather than the global ValidationPipe: the pipe
 * runs with `forbidNonWhitelisted: true`, which would 400 the moment Salla adds
 * a field to its payload. Rejecting a webhook because the sender got *more*
 * informative is exactly the wrong failure mode, so this DTO checks the fields
 * we depend on and ignores the rest.
 */
export class SallaWebhookEnvelopeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  event!: string;

  /** Salla store id. Sent as a number at the envelope level. */
  @IsOptional()
  @IsDefined()
  merchant?: number | string | null;

  @IsOptional()
  @IsString()
  created_at?: string;

  /** Event-specific body. Shape varies per event, so it stays untyped here. */
  @IsObject()
  data!: Record<string, unknown>;
}

export interface EnvelopeParseResult {
  ok: boolean;
  envelope?: SallaWebhookEnvelopeDto;
  errors?: string[];
}

export function parseWebhookEnvelope(body: unknown): EnvelopeParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }

  const envelope = plainToInstance(SallaWebhookEnvelopeDto, body);
  const failures = validateSync(envelope, {
    whitelist: false,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
  });

  if (failures.length > 0) {
    return {
      ok: false,
      errors: failures.map(
        (failure) => `${failure.property}: ${Object.values(failure.constraints ?? {}).join(', ')}`,
      ),
    };
  }

  return { ok: true, envelope };
}
