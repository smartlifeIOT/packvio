import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { AxiosError } from 'axios';
import { createHash } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { DataSource, IsNull } from 'typeorm';
import type { AppConfig } from '../../../config/configuration';
import { resolveEncryptionKey } from '../crypto/token-encryption';
import { SallaToken } from '../entities/salla-token.entity';
import { SallaNotConnectedError, SallaReauthorizationRequiredError } from '../errors/salla.errors';

/** Refresh when the token has less than this left. Salla tokens live 14 days. */
export const REFRESH_WINDOW_HOURS = 24;
const REFRESH_WINDOW_MS = REFRESH_WINDOW_HOURS * 60 * 60 * 1000;

export interface StoreTokenInput {
  storeId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
}

export interface SallaTokenStatus {
  connected: boolean;
  storeId: string | null;
  scope: string | null;
  expiresAt: Date | null;
  expiresInHours: number | null;
  revoked: boolean;
}

/**
 * Derives the 64-bit key for `pg_advisory_xact_lock`.
 *
 * Postgres advisory locks are keyed on a bigint, and store ids are arbitrary
 * numbers we do not control, so the id is namespaced and hashed rather than used
 * directly — that keeps this lock from colliding with any other advisory lock
 * anyone adds later for an unrelated purpose. The first 8 bytes of the SHA-256
 * are read as a signed big-endian integer, because Postgres bigint is signed.
 *
 * Returned as a string so it survives the trip through node-postgres without
 * going anywhere near IEEE-754.
 */
export function advisoryLockKey(storeId: string): string {
  const digest = createHash('sha256').update(`packvio:salla-token-refresh:${storeId}`).digest();
  return digest.readBigInt64BE(0).toString();
}

@Injectable()
export class SallaTokenService implements OnModuleInit {
  private readonly logger = new Logger(SallaTokenService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Second line of defence behind the Joi env schema: if the key is unusable,
   * say so at boot rather than at the first webhook, which is the worst possible
   * moment to discover it.
   */
  onModuleInit(): void {
    resolveEncryptionKey();
    this.logger.log('Salla token encryption key loaded (AES-256-GCM, v1 scheme).');
  }

  // --- reads -------------------------------------------------------------

  /** The one store this deployment talks to, if the app has been installed. */
  async getActiveStoreId(): Promise<string | null> {
    const token = await this.dataSource.getRepository(SallaToken).findOne({
      where: { revokedAt: IsNull() },
      order: { installedAt: 'DESC' },
      select: ['storeId'],
    });
    return token?.storeId ?? null;
  }

  async getStatus(): Promise<SallaTokenStatus> {
    const token = await this.dataSource
      .getRepository(SallaToken)
      .findOne({ where: {}, order: { installedAt: 'DESC' } });

    if (!token) {
      return {
        connected: false,
        storeId: null,
        scope: null,
        expiresAt: null,
        expiresInHours: null,
        revoked: false,
      };
    }

    return {
      connected: token.revokedAt === null,
      storeId: token.storeId,
      scope: token.scope,
      expiresAt: token.expiresAt,
      expiresInHours: hoursUntil(token.expiresAt),
      revoked: token.revokedAt !== null,
    };
  }

  // --- writes ------------------------------------------------------------

  /** Upsert on storeId. A reinstall updates in place and clears any revocation. */
  async storeToken(input: StoreTokenInput): Promise<void> {
    const repository = this.dataSource.getRepository(SallaToken);
    const existing = await repository.findOne({ where: { storeId: input.storeId } });
    const token = existing ?? repository.create({ storeId: input.storeId, installedAt: new Date() });

    token.accessToken = input.accessToken;
    token.refreshToken = input.refreshToken;
    token.expiresAt = input.expiresAt;
    token.scope = input.scope;
    token.revokedAt = null;

    await repository.save(token);
    this.logger.log(
      `Stored Salla token for store ${input.storeId} (expires ${input.expiresAt.toISOString()}, ` +
        `${existing ? 'updated' : 'new'}).`,
    );
  }

  /**
   * Uninstall: keep the row for the audit trail, just mark it dead. Deleting it
   * would erase the record that this store was ever connected.
   */
  async markRevoked(storeId: string, reason: string): Promise<void> {
    const repository = this.dataSource.getRepository(SallaToken);
    const token = await repository.findOne({ where: { storeId } });
    if (!token) {
      this.logger.warn(`Cannot revoke Salla token for store ${storeId}: no row stored.`);
      return;
    }
    if (token.revokedAt !== null) return;

    token.revokedAt = new Date();
    await repository.save(token);
    this.logger.log(`Revoked Salla token for store ${storeId} (${reason}).`);
  }

  // --- the interesting one -----------------------------------------------

  /**
   * A usable access token, refreshing it first if it is close to expiry.
   */
  async getValidToken(storeId?: string): Promise<string> {
    const id = storeId ?? (await this.getActiveStoreId());
    if (!id) throw new SallaNotConnectedError();

    const token = await this.dataSource.getRepository(SallaToken).findOne({ where: { storeId: id } });
    if (!token) throw new SallaNotConnectedError(id);
    if (token.revokedAt !== null) {
      throw new SallaReauthorizationRequiredError(id, 'token was revoked');
    }

    if (!needsRefresh(token.expiresAt)) return token.accessToken;

    return this.refreshUnderLock(id);
  }

  /** Admin-triggered refresh: goes through the same lock, ignores the window. */
  async forceRefresh(storeId?: string): Promise<Date> {
    const id = storeId ?? (await this.getActiveStoreId());
    if (!id) throw new SallaNotConnectedError();

    await this.refreshUnderLock(id, { force: true });
    const token = await this.dataSource.getRepository(SallaToken).findOne({ where: { storeId: id } });
    if (!token) throw new SallaNotConnectedError(id);
    return token.expiresAt;
  }

  /**
   * Read-check-refresh-write, serialised across every process by a Postgres
   * advisory lock.
   *
   * WHY THE LOCK IS HERE — do not "simplify" this away:
   * Salla invalidates the old refresh token the moment a refresh succeeds. If
   * two workers (or two replicas, or a webhook and the nightly reconcile) refresh
   * at the same time, the second one presents a refresh token that the first one
   * just burned. Salla answers invalid_grant, and the store ends up disconnected
   * with no way back except a manual reinstall. An in-process mutex cannot
   * prevent that — the contenders are in different processes — so the mutual
   * exclusion has to live in the one thing they share, which is Postgres.
   *
   * `pg_advisory_xact_lock` is held until the transaction ends, so it is released
   * automatically on commit, on rollback, and on a crashed connection. The
   * re-read inside the lock is not redundant: whichever caller loses the race
   * must see the token the winner just wrote and return it, instead of refreshing
   * a second time.
   */
  private async refreshUnderLock(storeId: string, options?: { force?: boolean }): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [advisoryLockKey(storeId)]);

      const token = await manager.getRepository(SallaToken).findOne({ where: { storeId } });
      if (!token) throw new SallaNotConnectedError(storeId);
      if (token.revokedAt !== null) {
        throw new SallaReauthorizationRequiredError(storeId, 'token was revoked');
      }

      // The double-check: another process may have refreshed while we queued.
      if (!options?.force && !needsRefresh(token.expiresAt)) {
        this.logger.debug(
          `Skipped Salla token refresh for store ${storeId}: another process already refreshed it.`,
        );
        return token.accessToken;
      }

      const refreshed = await this.requestRefresh(storeId, token.refreshToken);

      token.accessToken = refreshed.accessToken;
      token.refreshToken = refreshed.refreshToken;
      token.expiresAt = refreshed.expiresAt;
      if (refreshed.scope) token.scope = refreshed.scope;
      await manager.getRepository(SallaToken).save(token);

      this.logger.log(
        `Refreshed Salla token for store ${storeId}; new expiry ${refreshed.expiresAt.toISOString()}.`,
      );
      return refreshed.accessToken;
    });
  }

  /** The actual OAuth call. Never logs the request body or the response body. */
  private async requestRefresh(
    storeId: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; scope: string | null }> {
    const salla = this.config.get<AppConfig['salla']>('salla');
    const body = new URLSearchParams({
      client_id: salla?.clientId ?? '',
      client_secret: salla?.clientSecret ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    try {
      const response = await firstValueFrom(
        this.http.post<SallaOAuthTokenResponse>(
          salla?.oauthTokenUrl ?? 'https://accounts.salla.sa/oauth2/token',
          body.toString(),
          {
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            timeout: 15_000,
          },
        ),
      );

      const data = response.data;
      if (!data?.access_token || !data?.refresh_token) {
        throw new SallaReauthorizationRequiredError(
          storeId,
          'refresh response did not contain a token pair',
        );
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: expiryFrom(data),
        scope: data.scope ?? null,
      };
    } catch (error) {
      if (error instanceof SallaReauthorizationRequiredError) throw error;

      const reason = describeOAuthFailure(error);
      if (reason.fatal) {
        await this.markRevoked(storeId, `refresh rejected: ${reason.code}`);
        this.logger.error(
          `Salla refused to refresh the token for store ${storeId} (${reason.code}). ` +
            `THE APP MUST BE REINSTALLED from the Salla dashboard — no automatic recovery is possible.`,
        );
        throw new SallaReauthorizationRequiredError(storeId, reason.code);
      }

      this.logger.error(`Salla token refresh for store ${storeId} failed: ${reason.code}.`);
      throw new Error(`Salla token refresh failed: ${reason.code}`);
    }
  }
}

interface SallaOAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires?: number;
  scope?: string;
  token_type?: string;
}

export function needsRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() <= REFRESH_WINDOW_MS;
}

function hoursUntil(date: Date, now: Date = new Date()): number {
  return Math.round(((date.getTime() - now.getTime()) / (60 * 60 * 1000)) * 10) / 10;
}

/** Salla sends `expires_in` (seconds from now); some payloads send `expires` (unix seconds). */
export function expiryFrom(data: { expires_in?: number; expires?: number }): Date {
  if (typeof data.expires_in === 'number' && data.expires_in > 0) {
    return new Date(Date.now() + data.expires_in * 1000);
  }
  if (typeof data.expires === 'number' && data.expires > 0) {
    return new Date(data.expires * 1000);
  }
  // Salla's default lifetime is 14 days; assume the floor rather than treating
  // an absent field as "already expired" and hammering the refresh endpoint.
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

/**
 * Classifies a refresh failure. `fatal` means the grant is gone and no amount of
 * retrying will help — only a reinstall will.
 */
function describeOAuthFailure(error: unknown): { code: string; fatal: boolean } {
  const axiosError = error as AxiosError<{ error?: string; error_description?: string }> | undefined;
  const status = axiosError?.response?.status;
  const oauthError = axiosError?.response?.data?.error;

  const FATAL_CODES = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client']);
  if (typeof oauthError === 'string' && FATAL_CODES.has(oauthError)) {
    return { code: oauthError, fatal: true };
  }
  // A bare 400/401 from the token endpoint means the same thing in practice.
  if (status === 400 || status === 401) {
    return { code: `http ${status}${oauthError ? ` ${oauthError}` : ''}`, fatal: true };
  }
  if (status !== undefined) return { code: `http ${status}`, fatal: false };

  return { code: axiosError?.code ?? 'network error', fatal: false };
}
