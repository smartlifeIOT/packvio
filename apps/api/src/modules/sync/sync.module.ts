import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../catalog/entities/category.entity';
import { ProductCategory } from '../catalog/entities/product-category.entity';
import { ProductImage } from '../catalog/entities/product-image.entity';
import { Product } from '../catalog/entities/product.entity';
import { AdminApiKeyGuard } from './admin/admin-api-key.guard';
import { SallaAdminController } from './admin/salla-admin.controller';
import { SallaAdminService } from './admin/salla-admin.service';
import { ReconcileService } from './catalog/reconcile.service';
import { SallaCatalogWriterService } from './catalog/salla-catalog-writer.service';
import { SallaApiService } from './client/salla-api.service';
import { SallaEvent } from './entities/salla-event.entity';
import { SallaToken } from './entities/salla-token.entity';
import { SyncRun } from './entities/sync-run.entity';
import { SallaEventProcessor } from './events/salla-event-processor.service';
import { RevalidationModule } from './revalidation/revalidation.module';
import { SallaTokenService } from './token/salla-token.service';
import { SallaWebhookSignatureGuard } from './webhooks/salla-webhook-signature.guard';
import { SallaWebhookController } from './webhooks/salla-webhook.controller';
import { SallaWebhookService } from './webhooks/salla-webhook.service';

/**
 * Everything that talks to Salla: webhook ingest, the event worker, the catalog
 * mirror, the nightly reconcile, token lifecycle and the authenticated client.
 *
 * HttpModule is registered here rather than globally so the axios instance that
 * carries a Salla bearer token — injected by SallaApiService's interceptor —
 * belongs to this module alone and cannot be picked up by unrelated outbound
 * calls elsewhere in the app. RevalidationModule brings its OWN instance for
 * the same reason in reverse: purging our site's cache must not depend on, or
 * carry, a Salla credential.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SallaToken,
      SallaEvent,
      SyncRun,
      Product,
      Category,
      ProductImage,
      ProductCategory,
    ]),
    HttpModule.register({ timeout: 20_000, maxRedirects: 3 }),
    RevalidationModule,
  ],
  controllers: [SallaWebhookController, SallaAdminController],
  providers: [
    SallaWebhookSignatureGuard,
    SallaWebhookService,
    SallaEventProcessor,
    SallaTokenService,
    SallaApiService,
    SallaCatalogWriterService,
    ReconcileService,
    SallaAdminService,
    AdminApiKeyGuard,
  ],
  exports: [TypeOrmModule, SallaTokenService, SallaApiService, SallaCatalogWriterService],
})
export class SyncModule {}
