import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { QuoteRequestAcknowledgementDto } from '@packvio/shared';
import { normalizeSaudiPhone } from '@packvio/shared';
import { Product } from '../../catalog/entities/product.entity';
import { QuoteRequestItem } from '../entities/quote-request-item.entity';
import { QuoteRequest } from '../entities/quote-request.entity';
import type { CreateQuoteRequestDto } from '../dto/create-quote-request.dto';

/** Everything about the requester that comes from the connection, not the body. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class QuoteRequestService {
  private readonly logger = new Logger(QuoteRequestService.name);
  private readonly ipHashSalt: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.ipHashSalt = config.get<string>('quotes.ipHashSalt') ?? '';
  }

  /**
   * Persists an RFQ and returns the reference Postgres allocated.
   *
   * The whole thing is one transaction: a quote request with no items is not a
   * lead, it is a row nobody can action, so a failure part-way through must
   * leave nothing rather than half a request.
   */
  async create(
    dto: CreateQuoteRequestDto,
    context: RequestContext,
  ): Promise<QuoteRequestAcknowledgementDto> {
    /**
     * HONEYPOT: accepted, not rejected.
     *
     * Returning 201 with a plausible reference costs one wasted sequence value
     * and tells the bot nothing. A 400 naming the field would tell it exactly
     * what to stop filling in, and the next submission would get through. The
     * reference is real-looking but nothing is written, so sales never sees it.
     */
    if (dto.website) {
      this.logger.warn(
        `Discarded RFQ: honeypot field was filled (source=${dto.source}, locale=${dto.locale}).`,
      );
      return {
        reference: 'PV-0000-0000',
        createdAt: new Date().toISOString(),
        locale: dto.locale,
      };
    }

    // Validated by the DTO, so this cannot be null — but the normaliser is the
    // single source of the canonical form, so the value is taken from it rather
    // than from the raw input.
    const phone = normalizeSaudiPhone(dto.phone) ?? dto.phone;

    return this.dataSource.transaction(async (manager) => {
      const products = await this.resolveProducts(manager, dto);

      const quote = manager.getRepository(QuoteRequest).create({
        contactName: dto.contactName,
        companyName: dto.companyName,
        phone,
        email: dto.email,
        city: dto.city,
        message: dto.message,
        locale: dto.locale,
        source: dto.source,
        needsCustomPrinting: dto.needsCustomPrinting,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        ipHash: this.hashIp(context.ip),
        // Truncated: a user-agent is unbounded attacker-controlled text in a
        // column we only ever read to tell a browser from a script.
        userAgent: context.userAgent?.slice(0, 1000) ?? null,
      });

      /**
       * `reference` is a column DEFAULT backed by a Postgres sequence, so the
       * in-memory entity does not have it until the row is read back. Saving
       * and then reloading is what makes the value real rather than assumed —
       * see the quote-reference note in CLAUDE.md.
       */
      const saved = await manager.getRepository(QuoteRequest).save(quote);

      const items = dto.items.map((item) => {
        const product = item.productCode ? products.get(item.productCode.toLowerCase()) : undefined;

        return manager.getRepository(QuoteRequestItem).create({
          quoteRequestId: saved.id,
          productId: product?.id ?? null,
          /**
           * SNAPSHOTS, always written, even when the product resolved. A quote
           * has to stay readable years later if the product is renamed,
           * re-coded or deleted — see the entity note.
           *
           * The CANONICAL code wins over what the buyer typed: the lookup is
           * case-insensitive, so someone typing "pcs/08" resolves correctly but
           * would otherwise leave "pcs/08" in the column sales reads and greps.
           * The buyer's spelling is not information worth preserving; the
           * catalog's is.
           */
          productCodeSnapshot: product?.code ?? item.productCode ?? null,
          productNameSnapshot: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          note: item.note,
        });
      });

      await manager.getRepository(QuoteRequestItem).save(items);

      const stored = await manager.getRepository(QuoteRequest).findOneOrFail({
        where: { id: saved.id },
        select: ['reference', 'createdAt', 'locale'],
      });

      this.logger.log(
        `RFQ ${stored.reference} received: ${items.length} line(s), source=${dto.source}, locale=${dto.locale}.`,
      );

      return {
        reference: stored.reference,
        createdAt: stored.createdAt.toISOString(),
        locale: stored.locale,
      };
    });
  }

  /**
   * Maps the submitted codes to catalog rows in ONE query.
   *
   * Keyed lower-case because a buyer typing a code by hand types "pcs/08" as
   * often as "PCS/08", and an unresolved code silently degrades the line to
   * free text — losing the link to the product a salesperson needs to price it.
   * An unknown code is still not an error: it is a lead for something we may
   * simply not list yet.
   */
  private async resolveProducts(
    manager: EntityManager,
    dto: CreateQuoteRequestDto,
  ): Promise<Map<string, Product>> {
    const codes = [
      ...new Set(
        dto.items
          .map((item) => item.productCode)
          .filter((code): code is string => typeof code === 'string' && code.length > 0),
      ),
    ];

    if (codes.length === 0) return new Map();

    /**
     * Matched on `lower(code)`, not `IN (codes)`. Postgres comparison is
     * case-SENSITIVE, so an exact-match lookup would miss "pcs/08" for a row
     * stored as "PCS/08" — and the failure is silent: the line degrades to free
     * text and quietly loses the product link a salesperson needs to price it.
     */
    const rows = await manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select(['p.id', 'p.code'])
      .where('lower(p.code) IN (:...codes)', { codes: codes.map((code) => code.toLowerCase()) })
      .withDeleted()
      .getMany();

    return new Map(rows.map((row) => [row.code.toLowerCase(), row]));
  }

  /**
   * Salted HMAC of the submitter's IP — never the address itself.
   *
   * HMAC rather than sha256(salt + ip) so the construction is not vulnerable to
   * length-extension, and because "hash keyed by a secret" is exactly what this
   * is. Enough to rate-limit and to spot one address submitting fifty requests;
   * not enough to identify anyone, which is the point (see env.validation).
   */
  private hashIp(ip: string | null): string | null {
    if (!ip) return null;
    return createHmac('sha256', this.ipHashSalt).update(ip).digest('hex');
  }
}
