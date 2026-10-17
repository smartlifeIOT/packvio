import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../../config/configuration';
import { SallaApiError } from '../errors/salla.errors';
import { SallaTokenService } from '../token/salla-token.service';
import type {
  SallaBrand,
  SallaCategory,
  SallaListResponse,
  SallaPageQuery,
  SallaPingDto,
  SallaProduct,
  SallaSingleResponse,
} from './dto/salla-api.dto';

/** Failures eligible for backoff (429, 5xx, network) get this many tries total. */
const MAX_TRANSPORT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const MAX_RETRY_AFTER_MS = 60_000;

/** Defensive ceiling on paginate() so a bad totalPages cannot spin forever. */
export const MAX_PAGES = 200;
const DEFAULT_PER_PAGE = 50;

@Injectable()
export class SallaApiService implements OnModuleInit {
  private readonly logger = new Logger(SallaApiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly tokens: SallaTokenService,
  ) {}

  /**
   * The axios instance belongs to this module's HttpModule registration, not to
   * the app — so attaching an Authorization interceptor here cannot leak a Salla
   * bearer token onto some unrelated outbound request elsewhere in the process.
   */
  onModuleInit(): void {
    const instance = this.http.axiosRef;
    instance.defaults.baseURL = this.config.get<AppConfig['salla']>('salla')?.apiBase;

    instance.interceptors.request.use(async (request) => {
      const token = await this.tokens.getValidToken();
      request.headers.set('Authorization', `Bearer ${token}`);
      request.headers.set('Accept', 'application/json');
      return request;
    });
  }

  // --- typed endpoints ---------------------------------------------------

  listProducts(query: SallaPageQuery = {}): Promise<SallaListResponse<SallaProduct>> {
    return this.request<SallaListResponse<SallaProduct>>('GET', '/products', pageParams(query));
  }

  async getProduct(id: string | number): Promise<SallaProduct> {
    const response = await this.request<SallaSingleResponse<SallaProduct>>(
      'GET',
      `/products/${encodeURIComponent(String(id))}`,
    );
    return response.data;
  }

  listCategories(query: SallaPageQuery = {}): Promise<SallaListResponse<SallaCategory>> {
    return this.request<SallaListResponse<SallaCategory>>('GET', '/categories', pageParams(query));
  }

  listBrands(query: SallaPageQuery = {}): Promise<SallaListResponse<SallaBrand>> {
    return this.request<SallaListResponse<SallaBrand>>('GET', '/brands', pageParams(query));
  }

  /**
   * Cheapest authenticated call there is. Exercises the whole chain — stored
   * token, decryption, refresh-if-needed, bearer injection, Salla's auth — and
   * reports the raw status so a failure is diagnosable rather than just "false".
   */
  async ping(): Promise<SallaPingDto> {
    const started = Date.now();
    let storeId: string | null = null;

    try {
      storeId = await this.tokens.getActiveStoreId();
      const response = await firstValueFrom(
        this.http.request({ method: 'GET', url: '/store/info', validateStatus: () => true }),
      );
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        storeId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        status: statusOf(error) ?? null,
        storeId,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Walks Salla's pagination metadata and yields one page of items at a time, so
   * the reconcile job does not have to reimplement the loop — or rediscover that
   * `totalPages` occasionally disagrees with reality.
   */
  async *paginate<T>(
    fetchPage: (page: number, perPage: number) => Promise<SallaListResponse<T>>,
    options: { perPage?: number; maxPages?: number } = {},
  ): AsyncGenerator<T[], void, void> {
    const perPage = options.perPage ?? DEFAULT_PER_PAGE;
    const maxPages = Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES);

    let page = 1;
    while (page <= maxPages) {
      const response = await fetchPage(page, perPage);
      const items = response.data ?? [];
      if (items.length === 0) return;

      yield items;

      const totalPages = response.pagination?.totalPages;
      if (typeof totalPages === 'number' && page >= totalPages) return;
      // No pagination block and a short page means there is nothing after it.
      if (totalPages === undefined && items.length < perPage) return;

      page += 1;
    }

    this.logger.warn(
      `paginate() stopped at the ${maxPages}-page cap — results are TRUNCATED. ` +
        `Raise maxPages (ceiling ${MAX_PAGES}) or narrow the query.`,
    );
  }

  // --- transport ---------------------------------------------------------

  /**
   * One request plus the retry policy:
   *   401  → refresh the token once, retry once, then give up. Never loops.
   *   429  → honour Retry-After when present, otherwise backoff with jitter.
   *   5xx  → backoff with jitter.
   *   4xx  → fail immediately; retrying a bad request just wastes quota.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    let transportAttempts = 0;
    let authRetried = false;

    for (;;) {
      const started = Date.now();
      const config: AxiosRequestConfig = { method, url: path, params };

      try {
        const response = await firstValueFrom(this.http.request<T>(config));
        // Method, path, status, duration. Never bodies, never headers.
        this.logger.debug(`Salla ${method} ${path} → ${response.status} in ${Date.now() - started}ms`);
        return response.data;
      } catch (error) {
        const status = statusOf(error);
        const duration = Date.now() - started;
        this.logger.debug(`Salla ${method} ${path} → ${status ?? 'network error'} in ${duration}ms`);

        if (status === 401) {
          if (authRetried) {
            throw new SallaApiError(method, path, status, transportAttempts + 1, 'unauthorized after refresh');
          }
          authRetried = true;
          this.logger.warn(`Salla ${method} ${path} returned 401 — refreshing token and retrying once.`);
          await this.tokens.forceRefresh();
          continue;
        }

        const retryable = status === 429 || status === undefined || status >= 500;
        if (!retryable) {
          throw new SallaApiError(method, path, status, transportAttempts + 1);
        }

        transportAttempts += 1;
        if (transportAttempts >= MAX_TRANSPORT_ATTEMPTS) {
          throw new SallaApiError(method, path, status, transportAttempts);
        }

        const delay =
          status === 429
            ? (retryAfterMs(error) ?? backoffMs(transportAttempts))
            : backoffMs(transportAttempts);
        this.logger.warn(
          `Salla ${method} ${path} → ${status ?? 'network error'}; retry ${transportAttempts}/${MAX_TRANSPORT_ATTEMPTS} in ${delay}ms.`,
        );
        await sleep(delay);
      }
    }
  }
}

function pageParams(query: SallaPageQuery): Record<string, unknown> {
  return {
    page: query.page ?? 1,
    per_page: query.perPage ?? DEFAULT_PER_PAGE,
  };
}

function statusOf(error: unknown): number | undefined {
  return (error as AxiosError | undefined)?.response?.status;
}

/** Exponential backoff with full jitter on the increment, capped. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Retry-After is either delta-seconds or an HTTP date. Both are honoured. */
export function retryAfterMs(error: unknown, now: number = Date.now()): number | null {
  const header = (error as AxiosError | undefined)?.response?.headers?.['retry-after'];
  if (typeof header !== 'string' && typeof header !== 'number') return null;

  const raw = String(header).trim();
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
