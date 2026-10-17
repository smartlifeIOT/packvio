/**
 * Response shapes from Salla admin v2.
 *
 * These are inbound-from-a-third-party types, not request DTOs, so there are no
 * class-validator decorators here: Salla is free to add fields, and validating
 * its responses against our expectations would turn a harmless addition into an
 * outage. What matters is that callers get a typed object instead of an
 * AxiosResponse, and that only the fields listed here are relied on.
 *
 * Fields are named as Salla sends them (snake_case) — mapping to our own
 * camelCase entities happens in the catalog sync task, where the mirror lives.
 */

export interface SallaPagination {
  count: number;
  total: number;
  perPage: number;
  currentPage: number;
  totalPages: number;
}

export interface SallaListResponse<T> {
  status?: number;
  success?: boolean;
  data: T[];
  pagination?: SallaPagination;
}

export interface SallaSingleResponse<T> {
  status?: number;
  success?: boolean;
  data: T;
}

export interface SallaMoney {
  amount: number;
  currency: string;
}

export interface SallaImage {
  id?: number;
  url?: string;
  alt?: string;
  sort?: number;
  main?: boolean;
}

export interface SallaProductOptionValue {
  id?: number;
  name?: string;
  price?: SallaMoney;
  display_value?: string;
}

export interface SallaProductOption {
  id?: number;
  name?: string;
  type?: string;
  values?: SallaProductOptionValue[];
}

export interface SallaProductCategoryRef {
  id?: number;
  name?: string;
}

export interface SallaProduct {
  /**
   * Salla is free to add fields, and several of the ones we DO read arrive in
   * more than one shape (see salla-value-parsers). The index signature says so
   * in the type system: it lets a payload be handed to the tolerant parsers
   * without a cast, and it stops a modelled field's declared shape being
   * mistaken for a guarantee.
   */
  [key: string]: unknown;
  id: number;
  sku?: string | null;
  name?: string;
  description?: string | null;
  price?: SallaMoney;
  sale_price?: SallaMoney | null;
  quantity?: number | null;
  unlimited_quantity?: boolean;
  status?: string;
  urls?: { customer?: string; admin?: string };
  images?: SallaImage[];
  options?: SallaProductOption[];
  categories?: SallaProductCategoryRef[];
  updated_at?: { date?: string } | string | null;
}

export interface SallaCategory {
  /** See SallaProduct — same reasoning. */
  [key: string]: unknown;
  id: number;
  name?: string;
  parent_id?: number | null;
  status?: string;
  sort_order?: number;
  image?: string | null;
  urls?: { customer?: string; admin?: string };
  updated_at?: { date?: string } | string | null;
}

export interface SallaBrand {
  id: number;
  name?: string;
  description?: string | null;
  logo?: string | null;
  banner?: string | null;
}

export interface SallaPageQuery {
  page?: number;
  perPage?: number;
}

/** What /admin/salla/ping reports. Deliberately carries no token material. */
export class SallaPingDto {
  ok!: boolean;
  status!: number | null;
  storeId!: string | null;
  durationMs!: number;
  error?: string;
}
