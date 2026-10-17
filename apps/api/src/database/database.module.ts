import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { QueryCountLogger } from '../common/observability/query-count.logger';
import { QueryCounterService } from '../common/observability/query-counter.service';
import { dataSourceOptions } from './data-source';

const logger = new Logger('DatabaseModule');

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, QueryCounterService],
      useFactory: (config: ConfigService, counter: QueryCounterService) => {
        const isProduction = config.get<string>('nodeEnv') === 'production';

        return {
          ...dataSourceOptions,
          url: config.get<string>('databaseUrl'),
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 0,
          /**
           * Outside production, every query goes through QueryCountLogger, which
           * counts it against the current request and prints nothing. That is
           * what makes "this endpoint is 2 queries, not 25" a thing the dev log
           * states out loud instead of a claim in a comment. Production keeps
           * the quieter default — the counting is cheap, but the middleware log
           * line per request is not what production logs are for.
           */
          ...(isProduction
            ? {}
            : {
                logger: new QueryCountLogger(counter),
                logging: ['query', 'error', 'warn', 'schema', 'migration'],
              }),
        };
      },
      /**
       * A failed connection must NOT take the process down: /health is meant to
       * report `db: false` while Postgres is starting (or absent in CI) rather
       * than 502. So we swallow the initialize() error and hand Nest back an
       * uninitialized DataSource; HealthService reads `isInitialized`.
       */
      dataSourceFactory: async (options?: DataSourceOptions) => {
        const dataSource = new DataSource(options as DataSourceOptions);
        try {
          await dataSource.initialize();
          logger.log('Connected to PostgreSQL');
        } catch (error) {
          logger.error(
            `PostgreSQL connection failed — starting anyway, /health will report db:false. ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return dataSource;
      },
    }),
  ],
})
export class DatabaseModule {}
