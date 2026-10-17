import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CreateQuoteRequestDto } from '../dto/create-quote-request.dto';
import { QuoteRequestAcknowledgementResponse } from '../dto/quote-request-acknowledgement.dto';
import { QuoteRequestService } from '../services/quote-request.service';

/**
 * The RFQ endpoint — the site's primary conversion.
 *
 * No business logic here: the controller reads what the connection knows (IP,
 * user agent) and hands the validated DTO to the service, per the module rule
 * in CLAUDE.md.
 */
@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuoteRequestService) {}

  /**
   * Rate limited to QUOTE_RATE_LIMIT (default 5) per IP per hour.
   *
   * Chosen against the real usage: a buyer submits one RFQ, occasionally two if
   * they forgot a line. Five leaves room for a genuine mistake and a retry
   * while making a scripted flood pointless. The window is an hour rather than
   * a minute because the abuse this defends against is bulk lead-spam, which is
   * patient — a per-minute limit would let a bot post 300 an hour quite legally.
   *
   * There is deliberately no `@Throttle()` override here: the limit is
   * configured once in LeadsModule from QUOTE_RATE_LIMIT, and a literal in this
   * decorator would silently win over the environment variable that is supposed
   * to control it.
   *
   * It is a BACKSTOP, not the only defence: the honeypot catches the naive
   * bots without ever reaching the limit.
   */
  @Post()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a quote request (RFQ)',
    description:
      'Accepts a contact block and one or more requested lines. Returns only the ' +
      'generated reference — the submission is not echoed back, because it carries the ' +
      "submitter's own contact details. Rate limited to 5 per IP per hour.",
  })
  @ApiBody({ type: CreateQuoteRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Stored. The reference is allocated by Postgres.',
    type: QuoteRequestAcknowledgementResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded — try again later.' })
  async create(
    @Body() dto: CreateQuoteRequestDto,
    @Req() request: Request,
  ): Promise<QuoteRequestAcknowledgementResponse> {
    return this.quotes.create(dto, {
      ip: clientIp(request),
      userAgent: request.get('user-agent') ?? null,
    });
  }
}

/**
 * The submitter's IP, as best the app can know it.
 *
 * `request.ip` is correct ONLY when Express trusts the proxy in front of it; the
 * bootstrap sets `trust proxy` for exactly this reason. The fallback chain
 * exists so a misconfigured deployment stores a wrong-but-consistent value
 * rather than null for every row, which would silently disable the abuse
 * signal `ip_hash` is there to provide.
 *
 * Never trusted for authorisation — it is hashed and used to count submissions,
 * nothing more.
 */
function clientIp(request: Request): string | null {
  return request.ip ?? request.socket.remoteAddress ?? null;
}
