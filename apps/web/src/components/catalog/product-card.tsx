import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, FileText } from 'lucide-react';
import type { CatalogProductSummaryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { ProductMedia } from './product-media';

/**
 * How many swatches a card shows before collapsing to "+N".
 *
 * Six keeps the Leaf Spoon's seven colours to one line at the narrowest grid
 * column (300px, where the grid steps to two columns) — the row wrapping to a
 * second line changes the card's height, and a grid of cards at two different
 * heights is the thing this component already works hard to avoid.
 */
const SWATCH_LIMIT = 6;

export type ProductCardProps = {
  product: CatalogProductSummaryDto;
  /** `sizes` for the media slot — set it to match the grid this card sits in. */
  sizes?: string;
  /** Only the first card above the fold should set this. */
  priority?: boolean;
  className?: string;
};

/**
 * The single product card used by the home rails, the listing grid and the
 * related rail.
 *
 * Deliberately shows NO price. Every row's price is null until the Salla sync
 * runs, and an empty price slot on a card reads as a bug rather than as
 * "priced on request" — which is the truth, since this is a quote-first
 * wholesale catalog. The case quantity carries the commercial information
 * instead, which is what a wholesale buyer is actually scanning for.
 *
 * The whole card is one link. The CTA is styled as a button but is not a nested
 * interactive element — nesting a real <button> or a second <a> inside an <a> is
 * invalid and breaks keyboard traversal.
 */
export function ProductCard({ product, sizes, priority = false, className }: ProductCardProps) {
  const t = useTranslations('product');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';

  const isQuoteOnly = product.fulfilmentMode === 'quote';
  /**
   * Non-null only when this card stands for a FAMILY. The API returns one row
   * per family in every listing, with the whole family attached; a product
   * with no siblings has `variantGroup: null` and renders exactly as before.
   */
  const group = product.variantGroup;

  return (
    <Link
      href={{ pathname: '/product/[slug]', params: { slug: product.slug } }}
      className={cx(
        'group flex h-full flex-col gap-3 rounded-md',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-purple',
        className,
      )}
    >
      <ProductMedia
        image={product.primaryImage}
        code={product.code}
        categorySlug={product.primaryCategory?.slug}
        sizes={sizes}
        priority={priority}
        className="transition-shadow duration-200 group-hover:shadow-raised"
      />

      <div className="flex flex-1 flex-col gap-1.5 text-start">
        <h3 className="text-body font-medium text-ink group-hover:text-brand-purple">
          {/* The FAMILY name when this card stands for a family, so a tile
              reads "Leaf Spoon 11.5 cm" rather than "Leaf Spoon 11.5 cm
              Pearl" next to six near-identical neighbours. `product.name` is
              still the representative SKU's own full name, which is what the
              product page uses. */}
          {group ? group.name : product.name}
        </h3>

        {/* The code is the representative's, and showing it on a family card
            would name one SKU while the tile stands for several. The chips
            below carry the choice instead, and the code appears on the page
            the reader lands on. */}
        {!group && <p className="bidi-latin font-mono text-spec text-ink-muted">{product.code}</p>}

        {group && (
          <ul aria-label={group.name} className="flex flex-wrap items-center gap-1 pt-0.5">
            {group.variants.slice(0, SWATCH_LIMIT).map((variant) =>
              variant.swatch === null ? (
                /* No confident colour reading — show the label. Never a grey
                   chip standing in for an unknown colour: a buyer reads that
                   as a real option and orders the wrong thing. */
                <li
                  key={variant.id}
                  className="rounded-full border border-border px-1.5 py-0.5 text-caption text-ink-muted"
                >
                  {variant.label}
                </li>
              ) : (
                <li
                  key={variant.id}
                  title={variant.label}
                  className="size-4 rounded-full border border-border"
                  style={{ backgroundColor: variant.swatch }}
                >
                  {/* The colour name is the accessible label; the dot alone
                      conveys nothing to a screen reader, and colour must
                      never be the only channel carrying meaning. */}
                  <span className="sr-only">{variant.label}</span>
                </li>
              ),
            )}
            {group.count > SWATCH_LIMIT && (
              <li className="text-caption text-ink-muted">
                {t('variants.more', { count: group.count - SWATCH_LIMIT })}
              </li>
            )}
          </ul>
        )}

        {product.caseQuantity !== null && (
          <p className="text-body-sm text-ink-muted">
            {t('caseOf', { count: formatNumber(product.caseQuantity, locale) })}
          </p>
        )}

        <span
          className={cx(
            'mt-auto inline-flex items-center gap-1.5 pt-2',
            'text-body-sm font-medium text-brand-purple',
          )}
        >
          <Icon icon={isQuoteOnly ? FileText : ArrowRight} size={16} />
          {isQuoteOnly ? t('requestQuote') : t('viewDetails')}
        </span>
      </div>
    </Link>
  );
}
