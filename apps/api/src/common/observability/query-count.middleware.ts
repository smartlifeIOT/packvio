import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { QueryCounterService } from './query-counter.service';

/**
 * Opens a counting scope for the whole request and reports the total when the
 * response finishes.
 *
 * Middleware rather than an interceptor on purpose: middleware wraps the entire
 * request — guards, pipes, handler and serialisation all run inside the
 * AsyncLocalStorage context established here. An interceptor starts after guards
 * and pipes have already run, so any query they made would go uncounted, and
 * the number would understate the truth exactly where it matters.
 */
@Injectable()
export class QueryCountMiddleware implements NestMiddleware {
  private readonly logger = new Logger('QueryCount');

  constructor(private readonly counter: QueryCounterService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const store = { count: 0 };
    const startedAt = Date.now();

    this.counter.run(store, () => {
      response.on('finish', () => {
        this.logger.debug(
          `${request.method} ${request.originalUrl} → ${response.statusCode} · ` +
            `${store.count} quer${store.count === 1 ? 'y' : 'ies'} · ${Date.now() - startedAt}ms`,
        );
      });
      next();
    });
  }
}
