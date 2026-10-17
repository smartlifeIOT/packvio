'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * The quote basket — a buyer's shortlist, collected across pages and submitted
 * once.
 *
 * This is how B2B purchasing actually works: nobody sends ten separate quote
 * requests for ten SKUs, they send one with ten lines. Without it the product
 * page's only conversion is "request a quote for this one thing", and a buyer
 * pricing a whole café fit-out has to either submit repeatedly or abandon.
 *
 * STORAGE IS sessionStorage, AND ONLY sessionStorage. Not localStorage, not a
 * cookie. That is a deliberate privacy decision, not an oversight:
 *
 *   - It is scoped to the tab and cleared when the tab closes, so it is
 *     "strictly necessary for a service the user explicitly requested" — no
 *     consent banner, nothing to disclose, nothing to expire.
 *   - A cookie would be sent on every request to the API and the CDN, putting a
 *     shopping list in server logs for no benefit; nothing server-side reads it.
 *   - localStorage would persist a buyer's shortlist on a shared or public
 *     machine indefinitely, which is a real disclosure for a business whose
 *     purchasing is confidential.
 *
 * The cost is that the basket does not survive closing the tab. For a session
 * that ends in a submitted RFQ — which is the whole point — that is the correct
 * lifetime.
 */

export type QuoteBasketLine = {
  /** Catalog code, e.g. "PCS/08". The identity of a line. */
  code: string;
  name: string;
  /** Localized slug, so the basket can link back to the product page. */
  slug: string;
  /** Units per case, for showing "2 cases = 2,000 units". Null when unknown. */
  caseQuantity: number | null;
  /** In CASES — this is wholesale, and a case is the ordering unit. */
  quantity: number;
};

type QuoteBasketValue = {
  lines: QuoteBasketLine[];
  /** Total number of distinct SKUs — what the header badge shows. */
  count: number;
  /** True once sessionStorage has been read; guards the hydration mismatch. */
  isReady: boolean;
  add: (line: QuoteBasketLine) => void;
  setQuantity: (code: string, quantity: number) => void;
  remove: (code: string) => void;
  clear: () => void;
  has: (code: string) => boolean;
};

const STORAGE_KEY = 'packvio.quote-basket.v1';

const QuoteBasketContext = createContext<QuoteBasketValue | null>(null);

function read(): QuoteBasketLine[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    /**
     * Validated field by field rather than cast. sessionStorage is
     * user-writable and survives a deploy, so a stored value can be anything —
     * including last week's shape. A bad entry is dropped, not thrown on: a
     * corrupt basket must not white-screen every page that renders the badge.
     */
    return parsed.filter((entry): entry is QuoteBasketLine => {
      if (typeof entry !== 'object' || entry === null) return false;
      const line = entry as Partial<QuoteBasketLine>;
      return (
        typeof line.code === 'string' &&
        typeof line.name === 'string' &&
        typeof line.slug === 'string' &&
        typeof line.quantity === 'number' &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0
      );
    });
  } catch {
    return [];
  }
}

export function QuoteBasketProvider({ children }: { children: ReactNode }) {
  /**
   * Starts EMPTY on both server and client, then loads in an effect.
   *
   * Reading sessionStorage during render would make the first client render
   * disagree with the server's HTML and produce a hydration mismatch on every
   * page — the badge would say "3" where the server rendered nothing. `isReady`
   * lets consumers hold off until the real value has landed.
   */
  const [lines, setLines] = useState<QuoteBasketLine[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setLines(read());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private-browsing quota or a blocked storage API. The basket keeps
      // working in memory for this page; losing it on navigation is a better
      // outcome than an unhandled exception on every mutation.
    }
  }, [lines, isReady]);

  const add = useCallback((line: QuoteBasketLine) => {
    setLines((current) => {
      const existing = current.find((entry) => entry.code === line.code);
      // Adding a product already in the basket ADDS to its quantity rather than
      // replacing it — the reader pressed "add" twice meaning "more", not "no,
      // actually this many".
      if (existing) {
        return current.map((entry) =>
          entry.code === line.code
            ? { ...entry, quantity: entry.quantity + line.quantity }
            : entry,
        );
      }
      return [...current, line];
    });
  }, []);

  const setQuantity = useCallback((code: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((entry) => entry.code !== code)
        : current.map((entry) => (entry.code === code ? { ...entry, quantity } : entry)),
    );
  }, []);

  const remove = useCallback((code: string) => {
    setLines((current) => current.filter((entry) => entry.code !== code));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<QuoteBasketValue>(
    () => ({
      lines,
      count: lines.length,
      isReady,
      add,
      setQuantity,
      remove,
      clear,
      has: (code: string) => lines.some((entry) => entry.code === code),
    }),
    [lines, isReady, add, setQuantity, remove, clear],
  );

  return <QuoteBasketContext.Provider value={value}>{children}</QuoteBasketContext.Provider>;
}

export function useQuoteBasket(): QuoteBasketValue {
  const context = useContext(QuoteBasketContext);
  if (!context) {
    throw new Error('useQuoteBasket must be used inside <QuoteBasketProvider>.');
  }
  return context;
}
