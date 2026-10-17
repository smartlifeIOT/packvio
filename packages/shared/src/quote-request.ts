import type { Locale } from './locale';

/** Lifecycle of an RFQ — the site's primary conversion. */
export type QuoteRequestStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

/**
 * Where an RFQ came in from. Not free text: it is the field sales will slice
 * conversion by, and a free-text column becomes six spellings of "product page"
 * within a month.
 */
export type QuoteRequestSource = 'quote_page' | 'product' | 'contact';

/**
 * The ordering unit a line's quantity is expressed in.
 *
 * `case` is the wholesale default and what the form's stepper produces. `piece`
 * exists for the free-text row, where a buyer describing something not in the
 * catalog may not know a case size to count in.
 */
export type QuoteRequestUnit = 'case' | 'piece';

/** One line the buyer wants quoted. */
export interface CreateQuoteRequestItemDto {
  /**
   * Catalog code, e.g. "PCS/08". Null for a free-text line — a buyer asking for
   * something we do not list is a lead, not a validation error.
   */
  productCode: string | null;
  /**
   * What the buyer called it. Required even when `productCode` is set, so the
   * quote stays readable years later if the product is renamed or deleted.
   */
  productName: string;
  /** In `unit`s. The form steps this in cases; see QuoteRequestUnit. */
  quantity: number;
  unit: QuoteRequestUnit;
  note: string | null;
}

/**
 * The RFQ submission body — what apps/web POSTs to `/api/v1/quotes`.
 *
 * Note what is NOT here: `ipHash`, `userAgent` and `reference`. The first two
 * are derived server-side from the request itself (a client-supplied IP is not
 * evidence of anything), and the reference is allocated by Postgres. A client
 * that could set any of the three could forge attribution.
 */
export interface CreateQuoteRequestDto {
  contactName: string;
  companyName: string | null;
  /** Any Saudi format; the server normalises to E.164 (+9665XXXXXXXX). */
  phone: string;
  email: string;
  city: string | null;
  message: string | null;
  locale: Locale;
  source: QuoteRequestSource;
  needsCustomPrinting: boolean;
  items: CreateQuoteRequestItemDto[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /**
   * Honeypot. A real browser never fills this — it is visually hidden and
   * `tabindex="-1"`, so anything in it is a bot. Non-empty is accepted with a
   * 201 and silently discarded rather than rejected: telling a bot it failed
   * teaches it what to change.
   */
  website?: string | null;
}

/**
 * What the buyer gets back. Deliberately thin: the reference is the only thing
 * the thank-you screen needs, and echoing the whole submission back would put
 * the submitter's own contact details into a response that could be cached.
 */
export interface QuoteRequestAcknowledgementDto {
  reference: string;
  createdAt: string;
  locale: Locale;
}

/** One product line inside a stored quote request. */
export interface QuoteRequestItem {
  productId: string | null;
  productCode: string | null;
  productName: string;
  quantity: number;
  unit: QuoteRequestUnit;
  note: string | null;
}

/** A stored RFQ, as the back office will read it. */
export interface QuoteRequest {
  id: string;
  /** Human-readable reference shown to the buyer, e.g. "PV-2026-0001". */
  reference: string;
  companyName: string | null;
  contactName: string;
  email: string;
  /** E.164, Saudi numbers expected (+9665…). */
  phone: string;
  city: string | null;
  /** Locale the form was submitted in — replies go out in the same language. */
  locale: Locale;
  items: QuoteRequestItem[];
  message: string | null;
  status: QuoteRequestStatus;
  source: QuoteRequestSource | null;
  needsCustomPrinting: boolean;
  createdAt: string;
  updatedAt: string;
}
