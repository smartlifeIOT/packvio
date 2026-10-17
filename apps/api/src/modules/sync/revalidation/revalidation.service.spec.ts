import { of, throwError } from 'rxjs';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { RevalidationService, TAG_THRESHOLD } from './revalidation.service';

/**
 * The debounce is the point of this file.
 *
 * A reconcile touching 200 products must produce ONE request, not 200 — and
 * once the tag set is large enough that the whole catalog is being rebuilt
 * anyway, it must collapse to the broad `catalog` tag rather than enumerating
 * six hundred of them.
 */

function build(overrides: { secret?: string; siteUrl?: string } = {}) {
  const requests: Array<Record<string, unknown>> = [];

  const http = {
    request: (config: Record<string, unknown>) => {
      requests.push(config);
      return of({ status: 200, data: { revalidated: true } });
    },
  } as unknown as HttpService;

  const config = {
    get: () => ({
      secret: overrides.secret ?? 'test-secret',
      siteUrl: overrides.siteUrl ?? 'http://localhost:3000',
    }),
  } as unknown as ConfigService;

  return { service: new RevalidationService(http, config), requests };
}

describe('RevalidationService', () => {
  describe('debounce', () => {
    it('sends ONE request for a 200-product run', async () => {
      const { service, requests } = build();
      const batch = service.createBatch();

      // What a reconcile of 200 products actually produces: two locale slugs
      // each, plus the broad tag.
      for (let index = 0; index < 200; index += 1) {
        batch.add(['catalog', `product:product-${index}-en`, `product:product-${index}-ar`]);
      }
      expect(batch.size).toBe(401);

      await service.revalidate(batch);

      expect(requests).toHaveLength(1);
    });

    it('collapses a large tag set to the broad catalog tag', async () => {
      const { service, requests } = build();
      const batch = service.createBatch();
      for (let index = 0; index < 200; index += 1) {
        batch.add([`product:product-${index}`]);
      }

      await service.revalidate(batch);

      expect(batch.collapsed).toBe(true);
      expect((requests[0]?.data as { tags: string[] }).tags).toEqual(['catalog']);
    });

    it('keeps the specific tags for a small change, so one edit does not evict the site', async () => {
      const { service, requests } = build();
      const batch = service.createBatch();
      batch.add(['catalog', 'product:cup-8-oz', 'product:كوب-8']);

      await service.revalidate(batch);

      expect(batch.collapsed).toBe(false);
      const tags = (requests[0]?.data as { tags: string[] }).tags;
      expect(tags).toEqual(expect.arrayContaining(['product:cup-8-oz', 'product:كوب-8']));
    });

    it('collapses exactly above the threshold, not at it', async () => {
      const { service } = build();

      const atLimit = service.createBatch();
      for (let index = 0; index < TAG_THRESHOLD; index += 1) atLimit.add([`tag-${index}`]);
      expect(atLimit.collapsed).toBe(false);
      expect(atLimit.resolve()).toHaveLength(TAG_THRESHOLD);

      const overLimit = service.createBatch();
      for (let index = 0; index <= TAG_THRESHOLD; index += 1) overLimit.add([`tag-${index}`]);
      expect(overLimit.collapsed).toBe(true);
      expect(overLimit.resolve()).toEqual(['catalog']);
    });

    it('deduplicates repeated tags', async () => {
      const { service, requests } = build();
      const batch = service.createBatch();
      batch.add(['catalog', 'catalog', 'product:a', 'product:a']);

      await service.revalidate(batch);

      expect((requests[0]?.data as { tags: string[] }).tags).toHaveLength(2);
    });

    it('sends nothing at all when nothing changed', async () => {
      const { service, requests } = build();
      await service.revalidate(service.createBatch());
      expect(requests).toHaveLength(0);
    });
  });

  describe('the request', () => {
    it('puts the secret in a HEADER, never in the URL', async () => {
      const { service, requests } = build({ secret: 'super-secret' });
      const batch = service.createBatch();
      batch.add(['catalog']);

      await service.revalidate(batch);

      const request = requests[0];
      expect((request?.headers as Record<string, string>)['x-revalidate-secret']).toBe(
        'super-secret',
      );
      // A secret in a query string lands in access logs and proxy logs.
      expect(String(request?.url)).not.toContain('super-secret');
      expect(request?.url).toBe('http://localhost:3000/api/revalidate');
    });

    it('skips silently when no secret is configured', async () => {
      const { service, requests } = build({ secret: '' });
      const batch = service.createBatch();
      batch.add(['catalog']);

      expect(await service.revalidate(batch)).toBe(false);
      expect(requests).toHaveLength(0);
    });
  });

  describe('failure handling', () => {
    it('NEVER throws when the site is unreachable', async () => {
      const http = {
        request: () => throwError(() => new Error('ECONNREFUSED')),
      } as unknown as HttpService;
      const config = {
        get: () => ({ secret: 's', siteUrl: 'http://localhost:3000' }),
      } as unknown as ConfigService;

      const service = new RevalidationService(http, config);
      const batch = service.createBatch();
      batch.add(['catalog']);

      // A sync that has already written correctly must not be failed by a cache
      // purge — on a webhook that would make Salla redeliver an applied event.
      await expect(service.revalidate(batch)).resolves.toBe(false);
    });

    it('NEVER throws when the site answers with an error status', async () => {
      const http = {
        request: () => of({ status: 500, data: {} }),
      } as unknown as HttpService;
      const config = {
        get: () => ({ secret: 's', siteUrl: 'http://localhost:3000' }),
      } as unknown as ConfigService;

      const service = new RevalidationService(http, config);
      const batch = service.createBatch();
      batch.add(['catalog']);

      await expect(service.revalidate(batch)).resolves.toBe(false);
    });
  });
});
