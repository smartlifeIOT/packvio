import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../catalog/entities/product.entity';
import { QuotesController } from './controllers/quotes.controller';
import { QuoteRequestItem } from './entities/quote-request-item.entity';
import { QuoteRequest } from './entities/quote-request.entity';
import { QuoteRequestService } from './services/quote-request.service';

/**
 * RFQ capture — the site's primary conversion.
 *
 * ThrottlerModule is registered HERE rather than globally in AppModule, and the
 * guard is applied per-route rather than with APP_GUARD. The catalog endpoints
 * are read-only, cached by Next for five minutes, and hit by every page render;
 * putting a global rate limiter in front of them would throttle our own ISR
 * revalidation before it ever inconvenienced an abuser. The endpoint that needs
 * limiting is the one that writes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([QuoteRequest, QuoteRequestItem, Product]),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'quotes',
            // Hour-long window: the abuse this defends against is bulk
            // lead-spam, which is patient. See the controller note.
            ttl: 60 * 60 * 1000,
            limit: config.get<number>('quotes.rateLimit') ?? 5,
          },
        ],
      }),
    }),
  ],
  controllers: [QuotesController],
  providers: [QuoteRequestService],
  exports: [TypeOrmModule, QuoteRequestService],
})
export class LeadsModule {}
