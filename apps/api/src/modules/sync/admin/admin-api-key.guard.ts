import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

export const ADMIN_API_KEY_HEADER = 'x-admin-api-key';

/**
 * Shared-secret gate for the /admin/salla/* operational endpoints.
 *
 * Fails closed: if ADMIN_API_KEY is unset the endpoints are locked rather than
 * open. An operational endpoint that can force a token refresh is not something
 * to leave ungated because a config value was forgotten.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('adminApiKey') ?? '';
    const request = context.switchToHttp().getRequest<Request>();

    if (!expected) {
      this.logger.error(
        `Denied ${request.method} ${request.path}: ADMIN_API_KEY is not configured, so the admin endpoints are locked.`,
      );
      throw new UnauthorizedException('Admin endpoints are not configured.');
    }

    const header = request.headers[ADMIN_API_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !constantTimeEquals(provided, expected)) {
      this.logger.warn(`Denied ${request.method} ${request.path}: bad or missing ${ADMIN_API_KEY_HEADER}.`);
      throw new UnauthorizedException('Invalid admin API key.');
    }

    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on unequal lengths, so that has to be checked first.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
