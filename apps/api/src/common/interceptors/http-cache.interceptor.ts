import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Observable, map } from 'rxjs';

/** 60s fresh, then served stale for 5 minutes while the CDN refetches behind it. */
export const CATALOG_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

/**
 * Cache-Control plus a strong ETag on every GET.
 *
 * The catalog changes a few times a day and is read constantly, so the whole
 * read path should be servable from a CDN edge. `stale-while-revalidate` is the
 * important half: after 60 seconds the edge keeps answering instantly from the
 * stale copy while it refreshes in the background, so a cache expiry never costs
 * a reader a slow page.
 *
 * The ETag is a SHA-256 of the serialised body, which makes it STRONG — a weak
 * validator (`W/"…"`) would let a caller's `If-None-Match` match a body that is
 * merely equivalent, and range requests and byte-exact caching both care about
 * the difference. Hashing the body rather than a timestamp also means a
 * revalidation that produced identical bytes still returns 304, which is the
 * common case for a catalog page.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.method !== 'GET') return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        const etag = strongEtag(body);
        response.setHeader('Cache-Control', CATALOG_CACHE_CONTROL);
        response.setHeader('ETag', etag);
        response.setHeader('Vary', 'Accept-Encoding');

        if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
          response.status(304);
          // 304 must carry no body; returning undefined ends the response empty.
          return undefined;
        }

        return body;
      }),
    );
  }
}

function strongEtag(body: unknown): string {
  const serialized = body === undefined ? '' : JSON.stringify(body);
  return `"${createHash('sha256').update(serialized).digest('base64url')}"`;
}

/**
 * If-None-Match is a comma-separated list and may be `*`. Both forms are part of
 * the spec and both are sent in the wild, so neither can be assumed away.
 */
function matchesIfNoneMatch(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw.trim() === '*') return true;

  return raw
    .split(',')
    .map((candidate) => candidate.trim())
    // A client may echo back a weak form of a tag we issued strong.
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}
