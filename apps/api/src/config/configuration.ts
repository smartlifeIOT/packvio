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
  salla: {
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
    apiBase: string;
    oauthTokenUrl: string;
    /**
     * The language the store's Salla content is authored in.
     *
     * Salla admin v2 returns ONE language per request — the store's own — so a
     * sync can only fill one of `name_ar` / `name_en`. This says which. The
     * opposite column is left untouched rather than overwritten, because
     * clobbering a curated Arabic name with English is not recoverable without
     * a re-seed. See SallaCatalogMapper's ProductMappingOptions.
     */
    storeLocale: 'ar' | 'en';
  };
  adminApiKey: string;
  revalidate: {
    secret: string;
    siteUrl: string;
  };
  quotes: {
    /** Salt for `quote_requests.ip_hash`. See env.validation for why. */
    ipHashSalt: string;
    /** Submissions permitted per IP per hour. */
    rateLimit: number;
  };
}

/**
 * Typed view over process.env. Registered with ConfigModule.forRoot({ load })
 * so services read `config.get<AppConfig['salla']>('salla')` instead of raw
 * env strings.
 */
export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  salla: {
    clientId: process.env.SALLA_CLIENT_ID ?? '',
    clientSecret: process.env.SALLA_CLIENT_SECRET ?? '',
    webhookSecret: process.env.SALLA_WEBHOOK_SECRET ?? '',
    apiBase: process.env.SALLA_API_BASE ?? 'https://api.salla.dev/admin/v2',
    oauthTokenUrl: process.env.SALLA_OAUTH_TOKEN_URL ?? 'https://accounts.salla.sa/oauth2/token',
    storeLocale: process.env.SALLA_STORE_LOCALE === 'en' ? 'en' : 'ar',
  },
  // Note: SALLA_TOKEN_ENC_KEY is deliberately absent from this object. The
  // encryption transformer reads it straight from process.env because @Column
  // decorators run at import time, before any DI container exists — and keeping
  // it out of the config tree means it cannot be logged by a config dump.
  adminApiKey: process.env.ADMIN_API_KEY ?? '',
  revalidate: {
    secret: process.env.REVALIDATE_SECRET ?? '',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  },
  quotes: {
    ipHashSalt: process.env.QUOTE_IP_HASH_SALT ?? '',
    rateLimit: Number(process.env.QUOTE_RATE_LIMIT ?? 5),
  },
});
