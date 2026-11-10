import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from './common/observability/observability.module';
import { QueryCountMiddleware } from './common/observability/query-count.middleware';
import { configuration, ENV_FILE_PATHS } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { LeadsModule } from './modules/leads/leads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ENV_FILE_PATHS,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    // Must precede DatabaseModule: the DataSource factory injects the query
    // counter to build its logger.
    ObservabilityModule,
    DatabaseModule,
    HealthModule,
    CatalogModule,
    LeadsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, so the per-request query count covers guards and pipes too.
    consumer.apply(QueryCountMiddleware).forRoutes('*');
  }
}
