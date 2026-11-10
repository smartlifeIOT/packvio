import { join } from 'node:path';

/**
 * The monorepo keeps a single .env at the repo root, shared by docker-compose
 * and both apps. Resolved relative to this file so it works from dist/ too.
 */
export const ENV_FILE_PATHS = [
  join(__dirname, '..', '..', '..', '..', '.env'),
  join(__dirname, '..', '..', '..', '..', '..', '.env'),
  '.env',
];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  webOrigin: string;
  databaseUrl: string;
  quotes: {
    /** Salt for `quote_requests.ip_hash`. See env.validation for why. */
    ipHashSalt: string;
    /** Submissions permitted per IP per hour. */
    rateLimit: number;
  };
}

/**
 * Typed view over process.env. Registered with ConfigModule.forRoot({ load })
 * so services read `config.get<AppConfig['quotes']>('quotes')` instead of raw
 * env strings.
 */
export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  quotes: {
    ipHashSalt: process.env.QUOTE_IP_HASH_SALT ?? '',
    rateLimit: Number(process.env.QUOTE_RATE_LIMIT ?? 5),
  },
});
