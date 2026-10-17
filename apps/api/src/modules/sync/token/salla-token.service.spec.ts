import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { getMetadataArgsStorage } from 'typeorm';
import { SallaToken } from '../entities/salla-token.entity';
import { SallaReauthorizationRequiredError } from '../errors/salla.errors';
import { advisoryLockKey, expiryFrom, needsRefresh, SallaTokenService } from './salla-token.service';

const STORE_ID = '1234567890';
const HOUR = 60 * 60 * 1000;

interface TokenRow {
  storeId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
  revokedAt: Date | null;
  installedAt: Date;
}

/**
 * In-memory stand-in for the salla_tokens repository plus a DataSource whose
 * `transaction()` runs callbacks strictly one at a time.
 *
 * The serialisation here stands in for `pg_advisory_xact_lock` — Postgres
 * provides the real cross-process guarantee, and there is nothing a unit test
 * can assert about that. What IS under test is the half that lives in our code
 * and is easy to get wrong: re-reading the token INSIDE the lock so the caller
 * that loses the race returns the winner's token instead of burning the refresh
 * token a second time.
 */
function buildDataSource(row: TokenRow) {
  const lockedQueries: Array<{ sql: string; params: unknown[] }> = [];
  let tail: Promise<unknown> = Promise.resolve();

  const repository = {
    findOne: jest.fn(() => Promise.resolve(row)),
    save: jest.fn((entity: TokenRow) => {
      Object.assign(row, entity);
      return Promise.resolve(row);
    }),
    create: jest.fn((partial: Partial<TokenRow>) => ({ ...partial })),
  };

  const manager = {
    query: jest.fn((sql: string, params: unknown[]) => {
      lockedQueries.push({ sql, params });
      return Promise.resolve([]);
    }),
    getRepository: jest.fn(() => repository),
  };

  const dataSource = {
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(<T>(work: (m: typeof manager) => Promise<T>): Promise<T> => {
      const run = tail.then(() => work(manager));
      // Keep the chain alive even if this transaction rejects.
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  };

  return { dataSource, repository, manager, lockedQueries };
}

function buildService(row: TokenRow, http: Partial<HttpService>) {
  const built = buildDataSource(row);

  return Test.createTestingModule({
    providers: [
      SallaTokenService,
      { provide: getDataSourceToken(), useValue: built.dataSource },
      { provide: HttpService, useValue: http },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'salla'
              ? {
                  clientId: 'test-client',
                  clientSecret: 'test-secret',
                  oauthTokenUrl: 'https://accounts.salla.sa/oauth2/token',
                }
              : undefined,
        },
      },
    ],
  })
    .compile()
    .then((moduleRef) => ({ service: moduleRef.get(SallaTokenService), ...built }));
}

function nearExpiryToken(): TokenRow {
  return {
    storeId: STORE_ID,
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    expiresAt: new Date(Date.now() + 2 * HOUR), // inside the 24h window
    scope: 'offline_access products.read_write',
    revokedAt: null,
    installedAt: new Date(Date.now() - 30 * 24 * HOUR),
  };
}

describe('SallaTokenService', () => {
  describe('refresh window', () => {
    it('refreshes inside 24 hours and not outside it', () => {
      expect(needsRefresh(new Date(Date.now() + 2 * HOUR))).toBe(true);
      expect(needsRefresh(new Date(Date.now() + 23.5 * HOUR))).toBe(true);
      expect(needsRefresh(new Date(Date.now() + 25 * HOUR))).toBe(false);
      expect(needsRefresh(new Date(Date.now() - HOUR))).toBe(true);
    });
  });

  describe('advisoryLockKey', () => {
    it('is deterministic and store-specific', () => {
      expect(advisoryLockKey('1')).toBe(advisoryLockKey('1'));
      expect(advisoryLockKey('1')).not.toBe(advisoryLockKey('2'));
    });

    it('stays inside the signed 64-bit range Postgres accepts', () => {
      for (const storeId of ['1', '1234567890', '999999999999999']) {
        const key = BigInt(advisoryLockKey(storeId));
        expect(key).toBeGreaterThanOrEqual(-(2n ** 63n));
        expect(key).toBeLessThan(2n ** 63n);
      }
    });
  });

  describe('expiryFrom', () => {
    it('prefers expires_in seconds', () => {
      const expiry = expiryFrom({ expires_in: 3600 });
      expect(expiry.getTime()).toBeGreaterThan(Date.now() + 3500 * 1000);
    });

    it('falls back to an absolute unix expires', () => {
      const at = Math.floor(Date.now() / 1000) + 7200;
      expect(expiryFrom({ expires: at }).getTime()).toBe(at * 1000);
    });

    it('assumes the 14-day default rather than "already expired"', () => {
      expect(expiryFrom({}).getTime()).toBeGreaterThan(Date.now() + 13 * 24 * HOUR);
    });
  });

  describe('concurrent refresh', () => {
    it('makes exactly one refresh call when two callers race a near-expired token', async () => {
      const row = nearExpiryToken();
      const post = jest.fn(() =>
        of({
          data: {
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 1209600,
            scope: 'offline_access products.read_write',
          },
        }),
      );

      const { service, lockedQueries } = await buildService(row, {
        post,
      } as unknown as Partial<HttpService>);

      const [first, second] = await Promise.all([
        service.getValidToken(STORE_ID),
        service.getValidToken(STORE_ID),
      ]);

      // The whole point: one HTTP refresh, not two.
      expect(post).toHaveBeenCalledTimes(1);
      expect(first).toBe('access-new');
      expect(second).toBe('access-new');
      expect(row.refreshToken).toBe('refresh-new');

      // Both callers took the advisory lock, keyed on the store.
      expect(lockedQueries).toHaveLength(2);
      for (const query of lockedQueries) {
        expect(query.sql).toContain('pg_advisory_xact_lock');
        expect(query.params).toEqual([advisoryLockKey(STORE_ID)]);
      }
    });

    it('does not refresh at all when the token is comfortably valid', async () => {
      const row = { ...nearExpiryToken(), expiresAt: new Date(Date.now() + 10 * 24 * HOUR) };
      const post = jest.fn();
      const { service } = await buildService(row, { post } as unknown as Partial<HttpService>);

      await expect(service.getValidToken(STORE_ID)).resolves.toBe('access-old');
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('refresh failure', () => {
    it('revokes the token and throws a typed error on invalid_grant', async () => {
      const row = nearExpiryToken();
      const post = jest.fn(() =>
        throwError(() => ({
          isAxiosError: true,
          response: { status: 400, data: { error: 'invalid_grant' } },
        })),
      );

      const { service } = await buildService(row, { post } as unknown as Partial<HttpService>);

      await expect(service.getValidToken(STORE_ID)).rejects.toBeInstanceOf(
        SallaReauthorizationRequiredError,
      );
      await expect(service.getValidToken(STORE_ID)).rejects.toThrow(/must be reinstalled/i);
      expect(row.revokedAt).not.toBeNull();
    });

    it('does not revoke on a transient 500', async () => {
      const row = nearExpiryToken();
      const post = jest.fn(() =>
        throwError(() => ({ isAxiosError: true, response: { status: 503, data: {} } })),
      );

      const { service } = await buildService(row, { post } as unknown as Partial<HttpService>);

      await expect(service.getValidToken(STORE_ID)).rejects.toThrow(/http 503/);
      expect(row.revokedAt).toBeNull();
    });
  });

  describe('entity encryption wiring', () => {
    /**
     * Guards against someone dropping the transformer while refactoring the
     * entity: without it the tokens silently go back to plaintext on disk, and
     * nothing else in the suite would notice.
     */
    it.each(['accessToken', 'refreshToken'])('encrypts %s on the way to the column', (property) => {
      const column = getMetadataArgsStorage().columns.find(
        (candidate) => candidate.target === SallaToken && candidate.propertyName === property,
      );
      const transformer = column?.options.transformer;

      expect(transformer).toBeDefined();

      const single = Array.isArray(transformer) ? transformer[0] : transformer;
      const written = single?.to('a-token-value') as string;

      expect(written).toMatch(/^v1:/);
      expect(written).not.toContain('a-token-value');
      expect(single?.from(written)).toBe('a-token-value');
    });
  });
});
