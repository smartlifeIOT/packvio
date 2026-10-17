import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, FileText } from 'lucide-react';
import type { CatalogProductSummaryDto, Locale } from '@packvio/shared';
import { Icon } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { ProductMedia } from './product-media';

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
          {product.name}
        </h3>

        <p className="bidi-latin font-mono text-spec text-ink-muted">{product.code}</p>

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
