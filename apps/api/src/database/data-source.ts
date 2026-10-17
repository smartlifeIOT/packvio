import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';

// The TypeORM CLI runs this file standalone (no Nest bootstrap), so load the
// root .env ourselves before reading process.env.
loadEnv({ path: join(__dirname, '..', '..', '..', '..', '.env') });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Entities are picked up by glob here for the CLI; the Nest runtime uses
  // autoLoadEntities so every module's forFeature() registers itself.
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'packvio_migrations',
  // Never true outside tests — every schema change ships as a generated migration.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn', 'migration'] : ['error'],
};

/** Default export consumed by the typeorm CLI (`-d src/database/data-source.ts`). */
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
