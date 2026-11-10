'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check, FileText, ListPlus, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { CatalogFulfilmentMode, Locale } from '@packvio/shared';
import { Button, Icon } from '@/components/ui';
import { CONTACT } from '@/components/layout/nav-links';
import { useRouter } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { CaseStepper } from './case-stepper';
import { useQuoteBasket } from './quote-basket';

export type ProductActionsProps = {
  code: string;
  name: string;
  slug: string;
  caseQuantity: number | null;
  fulfilmentMode: CatalogFulfilmentMode;
};

/**
 * The buy/enquire panel.
 *
 * A wholesale buyer arrives in one of two states, and the panel has to serve
 * both without pretending they are the same person:
 *
 *   "what would this cost me"  → Request a Quote. Volume pricing, lead time,
 *                                custom printing. This is the primary action
 *                                and the site's main conversion.
 *   "I know what I want"       → ORDER NOW. A reorder of a line they already
 *                                buy, where a quote round-trip is friction, not
 *                                service.
 *
 * "Order now" opens WhatsApp, pre-filled with the product, its code and the
 * exact quantity — in Saudi B2B that is how a large share of reorders are
 * placed. It is offered for every product that can be ordered
 * (`fulfilmentMode` 'cart' or 'both').
 */
export function ProductActions({
  code,
  name,
  slug,
  caseQuantity,
  fulfilmentMode,
}: ProductActionsProps) {
  const t = useTranslations('product');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';
  const router = useRouter();
  const basket = useQuoteBasket();

  const [cases, setCases] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const showQuote = fulfilmentMode === 'quote' || fulfilmentMode === 'both';
  const canOrder = fulfilmentMode === 'cart' || fulfilmentMode === 'both';

  const units = caseQuantity ? caseQuantity * cases : null;

  /**
   * The WhatsApp order. Everything the merchant needs to price and pick the
   * order is in the message itself — code, name, cases and total units — so the
   * first reply can be a confirmation rather than three questions.
   *
   * `encodeURIComponent` on the whole message, not on fragments: the product
   * name contains Arabic and the code contains a slash, and both have to
   * survive the query string intact.
   */
  const whatsappHref = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappOrderPrefill', {
      name,
      code,
      cases: formatNumber(cases, locale),
      units: units === null ? '—' : formatNumber(units, locale),
    }),
  )}`;


  const addToBasket = () => {
    basket.add({ code, name, slug, caseQuantity, quantity: cases });
    setJustAdded(true);
    // The confirmation is transient on purpose: a permanently "Added ✓" button
    // stops telling the reader whether their SECOND click did anything.
    window.setTimeout(() => setJustAdded(false), 2500);
  };

  return (
    <div className="rounded-md border border-border bg-surface-alt p-lg">
      <CaseStepper value={cases} onChange={setCases} caseQuantity={caseQuantity} />

      <div className="mt-lg flex flex-col gap-3">
        {showQuote && (
          <Button
            as="button"
            type="button"
            size="lg"
            block
            icon={<Icon icon={FileText} size={20} />}
            onClick={() => {
              /**
               * Carries the product INTO the quote form via the URL rather than
               * only through the basket, so the link is meaningful on its own —
               * a shared `/quote?code=PCS/08&quantity=2` prefills for whoever
               * opens it, including someone who never saw the product page.
               */
              router.push({
                pathname: '/quote',
                query: { code, quantity: String(cases) },
              });
            }}
          >
            {t('requestQuote')}
          </Button>
        )}

        {canOrder && (
          <Button
            as="external"
            href={whatsappHref}
            target="_blank"
            size="lg"
            block
            variant="secondary"
            icon={<Icon icon={MessageCircle} size={20} />}
          >
            {t('orderOnWhatsapp')}
          </Button>
        )}

        <Button
          as="button"
          type="button"
          size="lg"
          block
          variant="ghost"
          icon={<Icon icon={justAdded ? Check : ListPlus} size={20} />}
          onClick={addToBasket}
        >
          {justAdded ? t('addedToQuoteList') : t('addToQuoteList')}
        </Button>
      </div>

      {/* aria-live so the basket count change is announced, not just seen. */}
      <p aria-live="polite" className="mt-3 min-h-5 text-body-sm text-ink-muted">
        {justAdded
          ? t('inQuoteList', { count: basket.count })
          : canOrder
            ? t('orderOrQuoteHelp')
            : t('quoteHelp')}
      </p>
    </div>
  );
}
