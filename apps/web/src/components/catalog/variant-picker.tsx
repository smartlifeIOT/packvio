import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { CatalogVariantGroupDto } from '@packvio/shared';
import { Link } from '@/i18n/navigation';
import { cx } from '@/lib/cx';

export type VariantPickerProps = {
  group: CatalogVariantGroupDto;
  className?: string;
};

/**
 * The colour / size chooser on a product page.
 *
 * EVERY VARIANT IS ITS OWN PAGE, so this is a row of links, not a client-side
 * state widget. That falls out of the data rather than being a styling choice:
 * each SKU keeps its own `code` — the key the Salla sync joins on — and its own
 * slug, which is a public URL. Making the colours a `useState` toggle would
 * mean one URL for seven products, which costs six indexable pages and leaves
 * a buyer unable to send a colleague a link to the colour they meant.
 *
 * The current variant is rendered as a non-link so the row always shows where
 * you are, and so keyboard traversal does not include a link to the page you
 * are already on.
 *
 * A swatch is drawn only when the data carries one. `swatch` is null wherever a
 * colour could not be read out of the label with confidence, and the fallback
 * is the label text — never a grey chip standing in for an unknown colour,
 * which is how a buyer orders the wrong thing.
 */
export function VariantPicker({ group, className }: VariantPickerProps) {
  const t = useTranslations('product');

  const heading =
    group.axis === 'size'
      ? t('variants.chooseSize')
      : group.axis === 'both'
        ? t('variants.chooseOption')
        : t('variants.chooseColour');

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <h2 className="text-body-sm font-medium text-ink-muted">
        {heading}
        {/* The count lets a reader see the range before scanning the chips. */}
        <span className="ms-2 text-caption text-ink-muted/70">
          {t('variants.count', { count: group.count })}
        </span>
      </h2>

      <ul className="flex flex-wrap gap-2">
        {group.variants.map((variant) => {
          const body = (
            <>
              {variant.swatch !== null && (
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: variant.swatch }}
                />
              )}
              <span className="whitespace-nowrap">{variant.label}</span>
              {variant.isCurrent && <Check size={14} aria-hidden="true" />}
            </>
          );

          const shared = 'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-body-sm';

          return (
            <li key={variant.id}>
              {variant.isCurrent ? (
                /* Not a link: this is the page you are on. aria-current tells a
                   screen reader the same thing the tick tells everyone else. */
                <span
                  aria-current="true"
                  className={cx(shared, 'border-brand-purple bg-brand-purple/5 font-medium text-brand-purple')}
                >
                  {body}
                </span>
              ) : (
                <Link
                  href={{ pathname: '/product/[slug]', params: { slug: variant.slug } }}
                  className={cx(
                    shared,
                    'border-border text-ink transition-colors',
                    'hover:border-brand-purple hover:text-brand-purple',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
