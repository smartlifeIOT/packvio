import { Logger as NestLogger } from '@nestjs/common';
import type { Logger as TypeOrmLogger, LogLevel, LogMessage, QueryRunner } from 'typeorm';
import type { QueryCounterService } from './query-counter.service';

/**
 * TypeORM logger that counts queries instead of printing them.
 *
 * TypeORM only calls `logQuery` when query logging is enabled, so counting
 * requires turning it on — and turning it on with the default logger buries
 * every request under a wall of SQL. This logger takes the callback and stays
 * quiet, while still forwarding the things worth seeing: failed queries and slow
 * ones.
 */
export class QueryCountLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('Database');

  constructor(
    private readonly counter: QueryCounterService,
    /** Set PACKVIO_LOG_SQL=1 to also print the SQL while debugging a plan. */
    private readonly printSql = process.env.PACKVIO_LOG_SQL === '1',
  ) {}

  logQuery(query: string, parameters?: unknown[]): void {
    this.counter.increment();
    if (this.printSql) {
      this.logger.debug(`${query}${parameters?.length ? ` -- ${JSON.stringify(parameters)}` : ''}`);
    }
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]): void {
    this.counter.increment();
    this.logger.error(
      `Query failed: ${error instanceof Error ? error.message : error}\n${query}${
        parameters?.length ? ` -- ${JSON.stringify(parameters)}` : ''
      }`,
    );
  }

  logQuerySlow(time: number, query: string): void {
    this.logger.warn(`Slow query (${time}ms): ${query}`);
  }

  logSchemaBuild(message: string): void {
    this.logger.log(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: LogLevel | 'log' | 'info' | 'warn', message: LogMessage, _queryRunner?: QueryRunner): void {
    if (level === 'warn') this.logger.warn(String(message));
    else this.logger.log(String(message));
  }
}
