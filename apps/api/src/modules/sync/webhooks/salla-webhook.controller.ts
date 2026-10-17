import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SallaWebhookAckDto } from '../dto/salla-webhook-ack.dto';
import { SALLA_SIGNATURE_HEADER } from './salla-signature';
import { SallaWebhookSignatureGuard } from './salla-webhook-signature.guard';
import { SallaWebhookService } from './salla-webhook.service';

/**
 * POST /api/v1/webhooks/salla
 *
 * The guard has already verified the HMAC by the time anything here runs. The
 * controller stays a pass-through: read the raw bytes off the request, hand them
 * to the service, return its acknowledgement.
 */
@Controller('webhooks/salla')
export class SallaWebhookController {
  constructor(private readonly webhooks: SallaWebhookService) {}

  @Post()
  @UseGuards(SallaWebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  receive(
    @Req() request: RawBodyRequest<Request>,
    // Typed as `unknown` on purpose: a class-typed parameter would be picked up
    // by the global ValidationPipe, whose `forbidNonWhitelisted: true` would 400
    // any payload where Salla added a field. The envelope is validated with
    // class-validator inside the service instead — see salla-webhook-envelope.dto.
    @Body() body: unknown,
    @Headers(SALLA_SIGNATURE_HEADER) signature?: string,
  ): Promise<SallaWebhookAckDto> {
    return this.webhooks.ingest(body, request.rawBody, signature);
  }
}
