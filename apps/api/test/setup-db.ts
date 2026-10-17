import { execFileSync } from 'node:child_process';

/**
 * Decides, before any `describe` is collected, whether a database is reachable.
 *
 * The catalog suite tests things that only exist in a database — a generated
 * column, a trigram index, Arabic normalisation in SQL, cross-locale slug
 * resolution. Those are not honestly testable against a mock repository: a stub
 * that returns whatever the test asked for proves nothing about whether Postgres
 * folds hamza the same way the TypeScript does, which is precisely the thing
 * most likely to drift.
 *
 * So the suite runs for real when Postgres is up and skips loudly when it is
 * not — `npm test` stays green on a machine without a database, and never
 * pretends the assertions ran.
 *
 * The probe is a synchronous child process because the decision has to be made
 * during module evaluation, before `describe` runs, and neither `setupFiles` nor
 * `setupFilesAfterEnv` awaits an async module body.
 */

declare global {
  // eslint-disable-next-line no-var -- a `global` flag must be declared with var
  var __PACKVIO_DB_AVAILABLE__: boolean;
}

function probeDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;

  let host: string;
  let port: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port || '5432';
  } catch {
    return false;
  }

  const script = `
    const net = require('node:net');
    const socket = net.connect({ host: ${JSON.stringify(host)}, port: ${Number(port)} });
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); process.exit(0); });
    socket.on('error', () => process.exit(1));
    socket.on('timeout', () => { socket.destroy(); process.exit(1); });
  `;

  try {
    execFileSync(process.execPath, ['-e', script], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

global.__PACKVIO_DB_AVAILABLE__ = probeDatabase();

if (!global.__PACKVIO_DB_AVAILABLE__) {
  console.warn(
    '\n[packvio] Postgres is not reachable at DATABASE_URL — the database-backed catalog suite ' +
      'is SKIPPED. Start it with `docker compose up -d postgres`, apply migrations and seed, ' +
      'then re-run to exercise search, slug resolution and pagination for real.\n',
  );
}

/** `describe` when a database is available, `describe.skip` when it is not. */
export const describeWithDb: jest.Describe = global.__PACKVIO_DB_AVAILABLE__
  ? describe
  : describe.skip;
