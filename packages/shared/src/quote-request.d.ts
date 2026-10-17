import type { Locale } from './locale';
/** Lifecycle of an RFQ — the site's primary conversion. */
export type QuoteRequestStatus = 'new' | 'in_review' | 'quoted' | 'won' | 'lost' | 'archived';
/** One product line inside a quote request. */
export interface QuoteRequestItem {
    productId: string | null;
    /** Free-text fallback when the buyer asks for something not in the catalog. */
    productName: string;
    quantity: number;
    /** Buyer wants their logo printed on this line. */
    customPrinting: boolean;
    notes: string | null;
}
/**
 * Placeholder shape — a submitted RFQ. Captured by apps/web, stored by apps/api.
 */
export interface QuoteRequest {
    id: string;
    /** Human-readable reference shown to the buyer, e.g. "RFQ-2026-0001". */
    reference: string;
    companyName: string;
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
    createdAt: string;
    updatedAt: string;
}
