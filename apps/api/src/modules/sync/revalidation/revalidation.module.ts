import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RevalidationService } from './revalidation.service';

/**
 * Its own module purely so it gets its own axios instance.
 *
 * `HttpModule.register()` provides a per-module axios instance. SyncModule's
 * instance carries SallaApiService's Authorization interceptor, which fetches a
 * Salla token on every request it touches. Reusing it here would send a Salla
 * bearer token to our own site and — the real problem — make cache purging fail
 * outright on any environment where the Salla app has not been installed yet.
 *
 * A ten-second timeout, and no retries: a purge that has not landed in ten
 * seconds is better abandoned than piled on top of. The ISR window expires on
 * its own, so the cost of giving up is bounded and small.
 */
@Module({
  imports: [HttpModule.register({ timeout: 10_000, maxRedirects: 0 })],
  providers: [RevalidationService],
  exports: [RevalidationService],
})
export class RevalidationModule {}
