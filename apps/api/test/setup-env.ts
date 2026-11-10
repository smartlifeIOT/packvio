import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

/**
 * Test environment, established before anything else runs.
 *
 * The root .env is loaded here because Jest starts with a bare process.env:
 * without it DATABASE_URL is undefined, the Postgres probe in setup-db.ts
 * concludes there is no database, and the entire integration suite skips itself
 * on a machine where Postgres is running perfectly well.
 *
 * `override: false` (the default) means a real environment variable always wins,
 * so CI can point the suite at its own database without editing anything.
 */
loadEnv({ path: join(__dirname, '..', '..', '..', '.env'), quiet: true });

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
