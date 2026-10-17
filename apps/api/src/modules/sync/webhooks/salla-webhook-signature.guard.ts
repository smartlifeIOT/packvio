import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../../config/configuration';
import {
  SALLA_SECURITY_STRATEGY_HEADER,
  SALLA_SIGNATURE_HEADER,
  verifySallaSignature,
} from './salla-signature';

/**
 * Verifies the webhook HMAC before anything else touches the request.
 *
 * A guard rather than a pipe or a controller branch, because guards run before
 * pipes: an unsigned request never reaches validation, never reaches the
 * database, and never gets parsed into anything a handler could act on.
 */
@Injectable()
export class SallaWebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(SallaWebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const salla = this.config.get<AppConfig['salla']>('salla');
    const secret = salla?.webhookSecret ?? '';
    const { event, storeId } = describeRequest(request);

    if (!secret) {
      this.logger.error(
        `Rejected Salla webhook (event=${event}, store=${storeId}): SALLA_WEBHOOK_SECRET is not configured.`,
      );
      throw new UnauthorizedException('Webhook signature verification is not configured.');
    }

    const rawBody = request.rawBody;
    const contentLength = Number(request.headers['content-length'] ?? NaN);

    /**
     * The raw-body pipeline is the foundation everything else rests on, so its
     * health is logged on every request rather than assumed. If these two
     * numbers ever diverge, the signature check is hashing the wrong bytes and
     * this line is how you find out.
     */
    this.logger.debug(
      `Salla webhook raw body: ${rawBody?.length ?? 0} bytes, Content-Length: ${
        Number.isNaN(contentLength) ? 'absent' : contentLength
      }, strategy: ${headerValue(request, SALLA_SECURITY_STRATEGY_HEADER) ?? 'unset'}`,
    );

    if (rawBody && !Number.isNaN(contentLength) && rawBody.length !== contentLength) {
      this.logger.warn(
        `Salla webhook raw body length (${rawBody.length}) does not match Content-Length (${contentLength}). ` +
          `Signature verification will fail — check that NestFactory.create was given { rawBody: true } ` +
          `and that no middleware re-encodes the body.`,
      );
    }

    const signature = headerValue(request, SALLA_SIGNATURE_HEADER);

    if (!verifySallaSignature(rawBody, signature, secret)) {
      // Never log the body or the signature itself: the body carries tokens on
      // app.store.authorize, and echoing a signature helps nobody but an attacker.
      this.logger.warn(
        `Rejected Salla webhook (event=${event}, store=${storeId}): ` +
          `${signature ? 'signature mismatch' : `missing ${SALLA_SIGNATURE_HEADER} header`}.`,
      );
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    return true;
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Best-effort identification of a request for logging. Never reads `data`. */
function describeRequest(request: Request): { event: string; storeId: string } {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return { event: 'unknown', storeId: 'unknown' };

  const record = body as Record<string, unknown>;
  const event = typeof record.event === 'string' ? record.event : 'unknown';
  const merchant = record.merchant;
  const storeId =
    typeof merchant === 'number' || typeof merchant === 'string' ? String(merchant) : 'unknown';

  return { event, storeId };
}
