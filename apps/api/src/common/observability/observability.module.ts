import { Global, Module } from '@nestjs/common';
import { QueryCounterService } from './query-counter.service';

/**
 * Global because the query counter has two consumers that cannot see each other:
 * the middleware that opens the per-request scope, and the DataSource factory
 * that builds the TypeORM logger doing the counting.
 */
@Global()
@Module({
  providers: [QueryCounterService],
  exports: [QueryCounterService],
})
export class ObservabilityModule {}
