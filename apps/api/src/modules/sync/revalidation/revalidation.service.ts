import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../../config/configuration';

/**
 * Above this many distinct tags, the request collapses to the broad `catalog`
 * tag instead of listing every one.
 *
 * A reconcile touching 200 products produces ~600 tags (two locale slugs each,
 * plus categories). Sending them costs a large request body and 600 individual
 * `revalidateTag` calls on the Next side to achieve what one `catalog` purge
 * achieves in a single call — the whole catalog is being rebuilt either way.
 * Below the threshold the specific tags are worth it, because a single product
 * edit should not evict the entire site's cache.
 */
export const TAG_THRESHOLD = 40;

/** Cap on the collected set, so a runaway loop cannot exhaust memory. */
const MAX_COLLECTED_TAGS = 5_000;

/**
 * Collects cache tags across a whole sync and sends ONE purge at the end.
 *
 * The debounce is the point. Without it, a reconcile that updates 200 products
 * fires 200 HTTP requests at the site — each one triggering a revalidation
 * sweep, most of them redundant, and all of them competing with real traffic
 * for the same Node process. One request at the end achieves the same thing.
 */
export class RevalidationBatch {
  private readonly tags = new Set<string>();
  private overflowed = false;

  add(tags: Iterable<string>): void {
    for (const tag of tags) {
      if (this.tags.size >= MAX_COLLECTED_TAGS) {
        this.overflowed = true;
        return;
      }
      this.tags.add(tag);
    }
  }

  get size(): number {
    return this.tags.size;
  }

  /**
   * The tags to actually send: the collected set, or `['catalog']` once it is
   * large enough that purging everything is cheaper than enumerating it.
   */
  resolve(): string[] {
    if (this.tags.size === 0) return [];
    if (this.overflowed || this.tags.size > TAG_THRESHOLD) return ['catalog'];
    return [...this.tags];
  }

  /** True when `resolve()` collapsed a larger set — worth saying in the log. */
  get collapsed(): boolean {
    return this.overflowed || this.tags.size > TAG_THRESHOLD;
  }
}

/**
 * Talks to the Next site, and to nothing else.
 *
 * It gets its OWN axios instance (see RevalidationModule) rather than sharing
 * SyncModule's. That is not tidiness: SallaApiService installs a request
 * interceptor on its instance which calls `getValidToken()` on every outbound
 * request. Sharing it would attach a Salla bearer token to a request to our own
 * site — and, far worse, would make revalidation THROW on any deployment where
 * the Salla app is not installed yet, because there is no token to fetch.
 * Cache purging must not depend on a third-party credential.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  createBatch(): RevalidationBatch {
    return new RevalidationBatch();
  }

  /**
   * Asks the Next site to purge the given tags.
   *
   * NEVER THROWS. A failed revalidation means the site serves data up to five
   * minutes stale — the ISR window expires on its own — whereas letting the
   * error propagate would fail a sync that has already written correctly to
   * Postgres, and on a webhook that means Salla retries a delivery we have
   * fully applied. Stale HTML is a smaller problem than a duplicated write.
   */
  async revalidate(batch: RevalidationBatch): Promise<boolean> {
    const tags = batch.resolve();
    if (tags.length === 0) return true;

    const revalidate = this.config.get<AppConfig['revalidate']>('revalidate');
    const secret = revalidate?.secret ?? '';
    const siteUrl = (revalidate?.siteUrl ?? '').replace(/\/+$/, '');

    if (!secret) {
      // Not an error: a dev machine with no secret configured should not spam
      // warnings on every write. It IS worth one debug line so a missing purge
      // in production is diagnosable.
      this.logger.debug('REVALIDATE_SECRET is not set — skipping on-demand revalidation.');
      return false;
    }

    if (!siteUrl) {
      this.logger.warn('No site URL configured — skipping on-demand revalidation.');
      return false;
    }

    const url = `${siteUrl}/api/revalidate`;

    try {
      const response = await firstValueFrom(
        this.http.request({
          method: 'POST',
          url,
          data: { tags },
          headers: {
            'content-type': 'application/json',
            // A header, not a query parameter: a secret in a URL lands in
            // access logs, proxy logs and browser history.
            'x-revalidate-secret': secret,
          },
          timeout: 10_000,
          validateStatus: () => true,
        }),
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `Revalidated ${tags.length} tag(s) on ${siteUrl}` +
            (batch.collapsed ? ` (collapsed from ${batch.size} to the broad 'catalog' tag)` : ''),
        );
        return true;
      }

      this.logger.error(
        `Revalidation returned ${response.status} from ${url}. The site will serve stale ` +
          `content until its ISR window expires. Sync data itself is unaffected.`,
      );
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Revalidation request to ${url} failed: ${message}. The site will serve stale content ` +
          `until its ISR window expires. Sync data itself is unaffected.`,
      );
      return false;
    }
  }
}
